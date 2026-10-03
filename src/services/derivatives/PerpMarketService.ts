import "server-only";

import { AxiosService } from "~/lib/axios";
import { AppInject, AppSignleton } from "~/lib/container";
import { venues as venueRegistry } from "./venues/VenueRegistry";
import type { PerpVenueQuote, VenueOutcome } from "./venue.port";

/**
 * The cross-venue perpetuals board: one row per coin, every venue's figures
 * merged into a single comparable set.
 *
 * This is the aggregation CoinGlass sells. Their sources are these venues'
 * public endpoints, so it is assembled here instead — keyless, and carrying the
 * exchange's own numbers rather than a re-reported estimate of them.
 *
 * **The comparison problem.** There is no such thing as "the" funding rate for a
 * coin. Seven venues quote seven rates, on two different settlement cycles, and
 * the honest figure is neither the first nor the average — it is the one
 * weighted by how much money each venue actually has in that contract. A small
 * venue quoting an extreme rate moves almost no positions, so an unweighted
 * mean would let it speak for the market. So:
 *
 * - funding is normalised to an **8-hour equivalent** before anything is compared,
 *   because Hyperliquid settles hourly and comparing that to an 8h rate
 *   unnormalised would show it as a quarter of the market;
 * - it is weighted by **open interest** where the venues report it, and falls
 *   back to an unweighted mean only when none do;
 * - the **dispersion** across venues is reported next to the average, because
 *   venues disagreeing is itself the signal — one venue paying a much higher
 *   rate than its peers is a venue with a locally crowded book.
 *
 * Every venue settles independently. One blocked, throttled or de-listed venue
 * degrades its own column, and the `venues` report says which, because a panel
 * showing three exchanges without saying the other four failed is worse than no
 * panel: it reads as a complete answer.
 */
const TTL_MS = 90_000;

/** A funding rate is only comparable once restated over a common interval. */
const REFERENCE_INTERVAL_HOURS = 8;

export type PerpCoinRow = {
  symbol: string;
  /** Median of the venues that reported one; robust to a single bad mark. */
  markPrice: number | null;
  /** Sum across venues, USD. Null when no venue reported a convertible figure. */
  openInterestUsd: number | null;
  volume24hUsd: number | null;
  /**
   * Open-interest-weighted funding, restated as an 8-hour rate **in percent**.
   *
   * A percentage because that is the unit every venue's UI quotes and the unit a
   * reader judges crowding by; null when nothing reported a rate.
   */
  fundingRate8hPct: number | null;
  /**
   * Highest minus lowest venue rate, in 8h percentage points.
   *
   * The cheapest number on the row to read and often the most useful: near zero
   * means venues agree the position is not stretched, and a wide spread means
   * the crowding is local to one exchange.
   */
  fundingDispersionPct: number | null;
  /** Accounts long ÷ short, from whichever venue publishes it. */
  longShortAccountRatio: number | null;
  /** Taker buy ÷ sell, from whichever venue publishes it. */
  takerBuySellRatio: number | null;
  /** How many venues answered for this coin. */
  venueCount: number;
  quotes: PerpVenueQuote[];
};

export type PerpMarketSnapshot = {
  coins: PerpCoinRow[];
  venues: VenueOutcome[];
  generatedAt: number;
  /**
   * True when this is the last good read replayed because the refresh failed.
   *
   * Reported rather than hidden: a stale total open interest is still honest, a
   * blank one is not, and the reader is entitled to know which they are looking
   * at.
   */
  stale: boolean;
  staleReason: string | null;
};

@AppSignleton()
export default class PerpMarketService {
  private cache: {
    value: PerpMarketSnapshot;
    expiresAt: number;
    key: string;
  } | null = null;
  private inflight: Promise<PerpMarketSnapshot> | null = null;

  /** The last read that produced at least one coin, replayed on total failure. */
  private lastGood: PerpMarketSnapshot | null = null;

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {}

  async getSnapshot(
    options: { symbols?: string[]; force?: boolean } = {},
  ): Promise<PerpMarketSnapshot> {
    const symbols = (options.symbols ?? ["BTC", "ETH", "SOL", "XRP"])
      .map((symbol) => symbol.toUpperCase())
      .filter((symbol) => /^[A-Z0-9]{2,20}$/.test(symbol))
      .slice(0, 8);

    // Tagged with the symbol set for the same reason the derivatives cache is:
    // the TTL check and the argument check must never disagree about which entry
    // is live.
    const key = symbols.join(",");

    if (
      !options.force &&
      this.cache &&
      this.cache.expiresAt > Date.now() &&
      this.cache.key === key
    ) {
      return this.cache.value;
    }
    if (this.inflight && this.inflightKey === key) return this.inflight;

    this.inflightKey = key;
    this.inflight = this.collect(symbols).finally(() => {
      this.inflight = null;
      this.inflightKey = null;
    });
    return this.inflight;
  }

  private inflightKey: string | null = null;

  private async collect(symbols: string[]): Promise<PerpMarketSnapshot> {
    const outcomes: VenueOutcome[] = [];

    // Every venue is asked at once, and each settles on its own. Serialising
    // here would make a blocked venue's timeout delay the four that answered.
    const results = await Promise.all(
      venueRegistry.all().map(async (adapter) => {
        try {
          const quotes = await adapter.fetchPerps(symbols);
          outcomes.push({
            id: adapter.id,
            label: adapter.label,
            ok: true,
            error: null,
            count: quotes.length,
          });
          return quotes;
        } catch (error) {
          outcomes.push({
            id: adapter.id,
            label: adapter.label,
            ok: false,
            error: describe(error),
          });
          return [] as PerpVenueQuote[];
        }
      }),
    );

    const snapshot: PerpMarketSnapshot = {
      coins: buildRows(symbols, results.flat()),
      // Sorted back into registry display order, because Promise.all settles in
      // completion order and a panel that reorders its own list on every slow
      // venue is unreadable.
      venues: venueRegistry
        .all()
        .map((adapter) => outcomes.find((o) => o.id === adapter.id))
        .filter((outcome): outcome is VenueOutcome => outcome !== undefined),
      generatedAt: Date.now(),
      stale: false,
      staleReason: null,
    };

    if (snapshot.coins.length === 0) {
      // Nothing at all came back. Replaying the last good read beats blanking a
      // board the reader was using thirty seconds ago, and `stale` says so.
      if (this.lastGood) {
        return {
          ...this.lastGood,
          stale: true,
          staleReason: "every venue failed",
          generatedAt: Date.now(),
        };
      }
      return snapshot;
    }

    this.lastGood = snapshot;
    this.cache = {
      value: snapshot,
      expiresAt: Date.now() + TTL_MS,
      key: symbols.join(","),
    };
    return snapshot;
  }
}

/** Merges every venue's quotes for one coin into a single comparable row. */
function buildRows(symbols: string[], quotes: PerpVenueQuote[]): PerpCoinRow[] {
  const bySymbol = new Map<string, PerpVenueQuote[]>();
  for (const quote of quotes) {
    const bucket = bySymbol.get(quote.symbol);
    if (bucket) bucket.push(quote);
    else bySymbol.set(quote.symbol, [quote]);
  }

  return symbols
    .map((symbol): PerpCoinRow | null => {
      const rows = bySymbol.get(symbol) ?? [];
      if (rows.length === 0) return null;

      const marks = rows
        .map((row) => row.markPrice)
        .filter((value): value is number => value !== null);
      const oiValues = rows
        .map((row) => row.openInterestUsd)
        .filter((value): value is number => value !== null);
      const volumes = rows
        .map((row) => row.volume24hUsd)
        .filter((value): value is number => value !== null);

      const rates = normalisedRates(rows);
      const weight = rows
        .map((row, index) => ({
          rate: rates[index] ?? null,
          oi: row.openInterestUsd,
        }))
        .filter(
          (entry): entry is { rate: number; oi: number | null } =>
            entry.rate !== null,
        );

      return {
        symbol,
        markPrice: median(marks),
        openInterestUsd: oiValues.length > 0 ? sum(oiValues) : null,
        volume24hUsd: volumes.length > 0 ? sum(volumes) : null,
        fundingRate8hPct: weightedRate(weight),
        fundingDispersionPct: dispersion(weight.map((entry) => entry.rate)),
        longShortAccountRatio: firstNumber(
          rows,
          (row) => row.longShortAccountRatio,
        ),
        takerBuySellRatio: firstNumber(rows, (row) => row.takerBuySellRatio),
        venueCount: rows.length,
        quotes: rows,
      };
    })
    .filter((row): row is PerpCoinRow => row !== null)
    .sort((a, b) => (b.openInterestUsd ?? 0) - (a.openInterestUsd ?? 0));
}

/**
 * Each venue's funding rate restated as a percentage over 8 hours.
 *
 * A null entry is a venue whose interval is unknown, and it is dropped rather
 * than assumed: guessing 8h for a venue that actually settles hourly is the
 * exact error this function exists to prevent.
 */
function normalisedRates(rows: PerpVenueQuote[]): (number | null)[] {
  return rows.map((row) => {
    if (row.fundingRate === null) return null;
    const hours = row.fundingIntervalHours;
    if (hours === null || hours <= 0) return null;
    const asEightHour = (row.fundingRate * REFERENCE_INTERVAL_HOURS) / hours;
    return asEightHour * 100;
  });
}

/**
 * Open-interest-weighted mean of the venue rates.
 *
 * Falls back to an unweighted mean when no venue reported open interest, because
 * a coin with rates but no notional still has a real funding rate and dropping it
 * would lose the row entirely.
 */
function weightedRate(
  entries: { rate: number; oi: number | null }[],
): number | null {
  if (entries.length === 0) return null;

  let weightTotal = 0;
  let weighted = 0;
  for (const entry of entries) {
    const oi = entry.oi;
    if (oi === null || oi <= 0) continue;
    weighted += entry.rate * oi;
    weightTotal += oi;
  }

  if (weightTotal === 0) {
    return (
      entries.reduce((total, entry) => total + entry.rate, 0) / entries.length
    );
  }
  return weighted / weightTotal;
}

/**
 * Spread between the venues' rates.
 *
 * Reported in percentage points of the 8-hour-equivalent rate, so a dispersion of
 * 0.04 means the most and least paying venue differ by 4 basis points a day —
 * which is noise — while 0.3 means one exchange's book is locally crowded.
 */
function dispersion(rates: number[]): number | null {
  if (rates.length < 2) return null;
  return Math.max(...rates) - Math.min(...rates);
}

/** First non-null value of a field, preferring the venue that reports it at all. */
function firstNumber(
  rows: PerpVenueQuote[],
  read: (row: PerpVenueQuote) => number | null,
): number | null {
  for (const row of rows) {
    const value = read(row);
    if (value !== null && Number.isFinite(value)) return value;
  }
  return null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? null);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function describe(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const status = (error as { response?: { status?: unknown } }).response
      ?.status;
    if (typeof status === "number") return `HTTP ${status}`;
  }
  if (error instanceof Error) {
    if (error.message.includes("timeout")) return "timed out";
    return error.message;
  }
  return "did not answer";
}
