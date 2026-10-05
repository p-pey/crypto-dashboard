import type { BinanceTicker } from "~/services/binance/binance.types";
import { coinPriceHistory } from "~/services/binance/priceHistory";
import { AppSignleton } from "~/lib/container";
import { applyRank, nextSort, sortRows } from "./coinSort";
import { DEFAULT_SORT, type CoinRow, type CoinSort } from "./coin.types";

/**
 * The coin table's data store.
 *
 * ## The problem it solves
 *
 * Binance pushes a combined stream for a hundred symbols, so a browser gets
 * several messages a second and each one used to do three expensive things:
 * allocate a brand-new object for the row, re-sort the entire list, and hand the
 * result to `setState`. A new array identity makes React re-render every row,
 * including the ninety-seven that had not moved, so a price change in one coin
 * cost a full-table repaint several times a second.
 *
 * ## What it does instead
 *
 * - **O(1) updates.** Rows live in a `Map` keyed by symbol, so applying a tick
 *   is a hash lookup rather than a scan. The previous `Array.find` was O(n) per
 *   tick, which is ten thousand comparisons a second for a hundred coins.
 * - **Only changed rows get a new identity.** An untouched row keeps its object,
 *   so `React.memo` skips it. A tick typically replaces three of a hundred rows
 *   and leaves the rest alone.
 * - **Ticks are coalesced to one frame.** The socket may deliver five messages
 *   before the next paint; the store applies all of them and notifies once, so the
 *   table can never render faster than the screen refreshes.
 * - **Sorting happens on demand, and only when it would change something.** The
 *   ordered array keeps its identity across ticks unless a value in the active
 *   sort column actually moved past a neighbour.
 *
 * ## Not a React store
 *
 * There is no `useSyncExternalStore` here because the rows are already React
 * state: the table holds a sorted array and re-renders on notification. What this
 * class owns is the *mutation* discipline, which is the part that has to be right
 * for memoisation to work at all.
 */

/** One notification per animation frame, at most. */
const FRAME_BUDGET_MS = 16;

@AppSignleton()
export class CoinStore {
  private readonly rows = new Map<string, CoinRow>();
  /** Cached sorted view. Replaced only when the ordering actually changes. */
  private ordered: CoinRow[] = [];
  private sort: CoinSort | null = DEFAULT_SORT;
  private revision = 0;

  private listeners = new Set<() => void>();
  /** Browser animation frame, or a timer id when there is no rAF. */
  private frame: ReturnType<typeof setTimeout> | number | null = null;

  /** Symbols in Binance's `BASEUSDT` form, mapped to their row. */
  private bySymbol = new Map<string, CoinRow>();

  /* ------------------------------------------------------------------ *
   * Seeding
   * ------------------------------------------------------------------ */

  /**
   * Installs the REST fundamentals.
   *
   * Called once per coin-list fetch. Existing rows are updated in place rather
   * than replaced so that a background refresh does not throw away the live
   * prices and hand every row a new identity.
   */
  seed(
    fundamentals: {
      symbol: string;
      id: string;
      name: string;
      image: string;
      marketCap: number | null;
      marketCapRank: number | null;
      fdv: number | null;
      volume24h: number | null;
      marketCapChange24h: number | null;
      changePercent24h: number | null;
      circulatingSupply: number | null;
      totalSupply: number | null;
      maxSupply: number | null;
      ath: number | null;
      athChangePercent: number | null;
      atl: number | null;
      high24h: number | null;
      low24h: number | null;
      spark7d: number[];
    }[],
  ): void {
    const seen = new Set<string>();

    for (const item of fundamentals) {
      seen.add(item.symbol);

      // The 7 day series seeds the sparkline so the trend is drawn immediately,
      // rather than growing from a single live tick.
      coinPriceHistory.seed(item.symbol, item.spark7d);

      const previous = this.rows.get(item.symbol);

      if (!previous) {
        this.rows.set(item.symbol, {
          ...item,
          base: item.symbol.replace(/USDT$/, ""),
          quote: "USDT",
          price: "—",
          changePercent: "—",
          changeAbs: "—",
          bestBid: null,
          bestAsk: null,
          spreadPercent: null,
          trades: null,
          venueHigh24h: null,
          venueLow24h: null,
          rank: 0,
          spark: coinPriceHistory.view(item.symbol),
          rev: 0,
        });
        continue;
      }

      // A refresh carries new fundamentals and no new price, so spreading
      // `previous` first keeps the live half - price, book, sparkline - exactly
      // as it was and only overwrites the static fields.
      this.rows.set(item.symbol, {
        ...previous,
        ...item,
        spark: coinPriceHistory.view(item.symbol),
        rev: previous.rev + 1,
      });
      this.contentStale = true;
    }

    // Coins that dropped out of the top hundred are removed rather than left as
    // stale rows that can no longer be priced.
    for (const symbol of [...this.rows.keys()]) {
      if (!seen.has(symbol)) this.rows.delete(symbol);
    }

    this.invalidateOrder();
    this.contentStale = true;
    this.notify();
  }

  /* ------------------------------------------------------------------ *
   * Live ticks
   * ------------------------------------------------------------------ */

  /**
   * Applies one websocket frame.
   *
   * Binance sends a combined stream, so a single frame can carry several
   * symbols. Each is folded into the existing row so the twenty-odd static fields
   * are not reallocated a hundred times a second.
   */
  applyTick(ticker: BinanceTicker): void {
    const previous = this.rows.get(ticker.s);
    if (!previous) return;

    const price = formatPrice(ticker.c);
    const last = Number.parseFloat(previous.price);
    const next = Number.parseFloat(price);

    // A coin whose price has not moved still refreshes its volume and trade
    // count, so the row is replaced either way - but only for that coin.
    const direction =
      Number.isFinite(last) && Number.isFinite(next) ? next - last : 0;
    if (direction !== 0) {
      coinPriceHistory.push(ticker.s, next);
    }

    const bid = Number.parseFloat(ticker.b);
    const ask = Number.parseFloat(ticker.a);
    const hasBook = Number.isFinite(bid) && Number.isFinite(ask) && ask > 0;

    const row: CoinRow = {
      ...previous,
      price,
      changePercent: `${Number.parseFloat(ticker.P).toFixed(2)}%`,
      changeAbs: Number.parseFloat(ticker.p).toFixed(4),
      bestBid: Number.isFinite(bid) ? ticker.b : null,
      bestAsk: Number.isFinite(ask) ? ticker.a : null,
      spreadPercent: hasBook ? (((ask - bid) / ask) * 100).toFixed(3) : null,
      trades: ticker.n ?? null,
      // The exchange's own 24h extremes are fresher than the REST copy, and they
      // agree with the live price the operator is looking at.
      venueHigh24h: ticker.h ?? previous.venueHigh24h,
      venueLow24h: ticker.l ?? previous.venueLow24h,
      spark: coinPriceHistory.view(ticker.s),
      rev: previous.rev + 1,
    };

    this.rows.set(ticker.s, row);
    this.contentStale = true;
    this.markOrderStale(row, sortKeyOfValue(this.sort?.key));

    /*
     * Notify, coalesced to one frame.
     *
     * `CoinStream` calls this for every message, so without the coalescing here
     * the table would render once per socket frame rather than once per paint.
     */
    this.notify();
  }

  /* ------------------------------------------------------------------ *
   * Reading
   * ------------------------------------------------------------------ */

  /**
   * The current view: sorted, ranked, and stable between changes.
   *
   * Callers rely on the returned array keeping its identity when nothing has
   * been re-sorted, because that is what lets React skip re-rendering the list.
   */
  snapshot(): CoinRow[] {
    if (this.orderStale) {
      this.rebuild();
    } else if (this.contentStale) {
      this.refreshContents();
    }
    return this.ordered;
  }

  get(key: CoinRow["symbol"]): CoinRow | undefined {
    return this.rows.get(key);
  }

  get size(): number {
    return this.rows.size;
  }

  get sortState(): CoinSort | null {
    return this.sort;
  }

  /**
   * Applies a header click.
   *
   * Rebuilds unconditionally, because a sort change is a deliberate action and
   * happens a handful of times per session.
   */
  setSort(next: CoinSort | null): void {
    this.sort = next;
    this.rebuild();
    this.notify();
  }

  toggleSort(key: CoinSort["key"]): void {
    this.setSort(nextSort(this.sort ?? DEFAULT_SORT, key));
  }

  /** Drops every row. Used when the coin list stops being available. */
  clear(): void {
    this.rows.clear();
    this.ordered = [];
    this.orderStale = false;
    this.contentStale = false;
    this.bySymbol = new Map();
    this.revision = 0;
    coinPriceHistory.clear();
    this.notify();
  }

  /* ------------------------------------------------------------------ *
   * Subscription
   * ------------------------------------------------------------------ */

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Bumped on every notification, so effects can depend on "something moved". */
  get version(): number {
    return this.revision;
  }

  /**
   * Notifies on the next frame, at most once.
   *
   * The socket can deliver several messages between paints. Rendering once per
   * message would do work the screen never shows, so notifications are collapsed
   * into a single `requestAnimationFrame` callback.
   */
  private notify(): void {
    // A notification already queued will read the store as it stands when it
    // runs, so anything arriving before then is covered by it.
    if (this.frame !== null) return;

    const run = () => {
      this.frame = null;
      this.revision += 1;
      for (const listener of this.listeners) listener();
    };

    this.frame =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(run)
        : setTimeout(run, FRAME_BUDGET_MS);
  }

  /* ------------------------------------------------------------------ *
   * Ordering
   * ------------------------------------------------------------------ */

  /**
   * Two independent staleness flags, and keeping them apart is the whole game.
   *
   * `contentStale` means a row object was replaced, so the cached array is
   * pointing at superseded objects. `orderStale` means the *positions* may be
   * wrong too.
   *
   * Collapsing these into one flag is a bug that looks like a performance
   * optimisation: a price tick on a coin that stays in its sorted position does
   * not change the order, so `orderStale` stays false, `snapshot()` returns the
   * cached array, and React is handed the old row objects. The row is memoised,
   * so it does not re-render, and **the price on screen never moves** - while
   * every other part of the system reports that ticks are being applied.
   */
  private contentStale = false;
  private orderStale = false;

  private invalidateOrder(): void {
    this.orderStale = true;
  }

  /** Swaps fresh row objects into the cached array without re-sorting it. */
  private refreshContents(): void {
    let changed = false;

    const next = this.ordered.map((entry) => {
      const current = this.rows.get(entry.symbol);
      if (current && current !== entry) {
        changed = true;
        return current;
      }
      return entry;
    });

    // Only replace the array when something really changed, so a notification
    // that turns out to be a no-op does not force a re-render.
    if (changed) {
      this.ordered = next;
      this.bySymbol = new Map(next.map((row) => [row.symbol, row]));
    }
    this.contentStale = false;
  }

  /**
   * Marks the order dirty only when the tick could actually reorder the list.
   *
   * The common case is a price change on a coin that is nowhere near its
   * neighbour, which cannot move it in a market-cap ordering. Checking the
   * neighbours turns "re-sort a hundred rows several times a second" into
   * "usually do nothing", which is the whole point of tracking this separately.
   */
  private markOrderStale(row: CoinRow, key: CoinSort["key"] | undefined): void {
    if (!key) {
      // Unsorted, or sorting on a REST-only column: the order cannot have moved,
      // so only the row contents need refreshing.
      return;
    }

    if (key === "price" || key === "changePercent" || key === "volume24h") {
      // These columns move on every tick for most coins, so reordering is
      // frequent by nature and the check would cost more than it saves.
      this.orderStale = true;
      return;
    }

    const previous = this.bySymbol.get(row.symbol);
    this.bySymbol.set(row.symbol, row);
    if (!previous) {
      this.orderStale = true;
      return;
    }

    const before = comparable(previous, key);
    const after = comparable(row, key);
    if (before === null || after === null) {
      // A row that has no value for this column can still change where the
      // null-sink boundary falls, so it is always worth a rebuild.
      this.orderStale = true;
      return;
    }
    if (before === after) return;

    // Even a real move only matters if it crosses a neighbour.
    if (this.crossesNeighbour(row, key, before, after)) {
      this.orderStale = true;
    }
  }

  private crossesNeighbour(
    row: CoinRow,
    key: NonNullable<CoinSort["key"]>,
    before: number,
    after: number,
  ): boolean {
    const index = this.ordered.findIndex(
      (entry) => entry.symbol === row.symbol,
    );
    if (index === -1) return true;

    if (before === null || after === null) return true;

    const direction = this.sort?.direction === "asc" ? 1 : -1;
    const moved = (after - before) * direction;
    if (moved === 0) return false;

    const neighbour =
      moved > 0 ? this.ordered[index - 1] : this.ordered[index + 1];
    if (!neighbour) return false;

    const theirs = comparable(neighbour, key);
    if (theirs === null) return false;

    // The row only needs re-sorting if it is now on the wrong side of a
    // neighbour that previously kept it in place.
    return (after - theirs) * direction > 0;
  }

  private rebuild(): void {
    const rows = applyRank(sortRows([...this.rows.values()], this.sort));

    /*
     * The ranked rows are written back into the map.
     *
     * `applyRank` clones any row whose position changed, so the array it returns
     * holds *different objects* from the ones in `this.rows`. Without writing them
     * back, the two drift: `refreshContents` then sees every entry as superseded
     * and swaps the whole array for the stale un-ranked copies on the next tick,
     * which throws away row identity and resets every visible rank to zero.
     */
    for (const row of rows) this.rows.set(row.symbol, row);

    this.ordered = rows;
    this.bySymbol = new Map(rows.map((row) => [row.symbol, row]));
    this.orderStale = false;
    this.contentStale = false;
  }
}

/* -------------------------------------------------------------------- *
 * Helpers
 * -------------------------------------------------------------------- */

type SortableKey = NonNullable<CoinSort["key"]>;

/** Maps a sort key to the column a tick can move, for the staleness check. */
function sortKeyOfValue(key: SortableKey | undefined): SortableKey | undefined {
  // `volume24h` is a REST field, so no tick can change the ordering by it.
  if (key === "volume24h") return undefined;
  return key;
}

function comparable(row: CoinRow, key: SortableKey): number | null {
  switch (key) {
    case "rank":
      return row.marketCapRank;
    case "price": {
      const value = Number.parseFloat(row.price);
      return Number.isFinite(value) ? value : null;
    }
    case "marketCap":
      return row.marketCap;
    case "volume24h":
      return row.volume24h;
    case "changePercent": {
      const value = Number.parseFloat(row.changePercent);
      return Number.isFinite(value) ? value : null;
    }
  }
}

/**
 * Formats a price without losing a small coin's precision.
 *
 * A fixed three decimals rounds every altcoin to `0.000`, which is worse than
 * showing nothing, so the precision follows the magnitude: a dollar-scale coin
 * gets two places and a micro-cap gets eight.
 */
export function formatPrice(raw: string | number): string {
  const value = typeof raw === "number" ? raw : Number.parseFloat(raw);
  if (!Number.isFinite(value)) return "—";

  if (value >= 1000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  if (value >= 0.01) return value.toFixed(6);
  if (value >= 0.0001) return value.toFixed(8);
  return value.toPrecision(4);
}
