import "server-only";

import { AxiosService } from "~/lib/axios";
import { AppInject, AppSignleton } from "~/lib/container";
import { venues as venueRegistry } from "./venues/VenueRegistry";
import type { LiquidationPrint, VenueOutcome } from "./venue.port";

/**
 * Liquidations, aggregated from the venues that publish them.
 *
 * This is the headline figure CoinGlass sells and the reason this page exists.
 * A forced close is not a sale — it is a position removed because the venue's
 * risk engine decided the margin was gone — and the **size** of those removals
 * is what makes a 4% move feel like a 12% move to somebody holding perp.
 *
 * **What this is built on, and what it is not.** Binance and OKX publish a
 * complete REST history of forced closes, keyless. That is the whole source:
 * two authoritative feeds rather than seven partial ones. It is also *not* the
 * whole market — Hyperliquid, Deribit, Bitget and MEXC publish nothing at all,
 * and Deribit is large enough that its absence is material. So the totals below
 * are explicitly **the liquidations these two venues saw**, the panel names them
 * on screen, and `venues` distinguishes "does not publish" from "did not answer"
 * so a block can never be mistaken for calm.
 *
 * Deriving the figure from trade tape would be possible and would be a lie: a
 * large market sell and a forced close print identically, and the difference
 * between those two is the entire content of this panel.
 *
 * **Bucketing, and why not a single total.** One figure — "24h liquidations:
 * $412M" — is unreadable, because liquidations are a rate, not an amount: the
 * question is never *how much* but *how fast*. So the primary view is a time
 * series of per-interval notional, which is where a cascade is visible as a
 * spike rather than as an average nobody can interpret.
 */
const TTL_MS = 60_000;

/** Bucket width for the series. Matches the refresh interval. */
const BUCKET_MS = 5 * 60_000;
const BUCKET_COUNT = 24; // two hours of history
const WINDOW_MS = BUCKET_MS * BUCKET_COUNT;

/**
 * Coins asked for when the caller names none.
 *
 * This default is load-bearing rather than cosmetic. Both publishing venues bill
 * their liquidation tape **per symbol**, so an empty list means no request is
 * made at all — and a venue that made no request would report itself as having
 * answered, rendering "no liquidations" for a coin nobody asked about. Naming
 * the deep-perps coins is also what the panel means by "liquidations": a cascade
 * in a thin alt is not the event anyone is watching for.
 */
const DEFAULT_SYMBOLS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "BNB"];

export type LiquidationBucket = {
  /** Start of the interval, epoch ms. */
  timestamp: number;
  longUsd: number;
  shortUsd: number;
  /** `longUsd + shortUsd`, for the stack height. */
  totalUsd: number;
  count: number;
};

export type LiquidationSnapshot = {
  /** Per-interval series, oldest first. */
  buckets: LiquidationBucket[];
  windowUsd: number;
  windowLongUsd: number;
  windowShortUsd: number;
  printCount: number;
  /** The single largest forced close in the window. */
  largest: LiquidationPrint | null;

  /** Per-coin totals over the window, largest first. */
  bySymbol: {
    symbol: string;
    usd: number;
    longUsd: number;
    shortUsd: number;
    count: number;
  }[];

  /**
   * How the last interval compares with the ones before it.
   *
   * A liquidation cascade is a rate change, so the number that matters is the
   * ratio between the most recent bucket and the median of the rest — not the
   * absolute total, which a large calm market will always outscore.
   */
  burstRatio: number | null;

  generatedAt: number;
  stale: boolean;
  staleReason: string | null;

  /**
   * Which venues publish liquidations, and which of those answered.
   *
   * `unsupported` is not an error and is shown differently: four venues having
   * no such feed is a fact about the industry, while two failing is a fact about
   * this network, and conflating them would blame the market for a timeout.
   */
  venues: VenueOutcome[];
  /** Venues that publish a liquidations feed, whether or not they answered. */
  coverage: { id: string; label: string }[];
};

@AppSignleton()
export default class LiquidationsService {
  private cache: { value: LiquidationSnapshot; expiresAt: number } | null =
    null;
  private inflight: Promise<LiquidationSnapshot> | null = null;
  private lastGood: LiquidationSnapshot | null = null;

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {}

  async getSnapshot(
    options: { symbols?: string[]; force?: boolean } = {},
  ): Promise<LiquidationSnapshot> {
    if (!options.force && this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.value;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.collect(options.symbols).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async collect(symbols?: string[]): Promise<LiquidationSnapshot> {
    const publishing = venueRegistry.liquidationsVenues();
    const all = venueRegistry.all();

    // Never empty: see DEFAULT_SYMBOLS. An empty list would mean zero requests
    // and a venue reporting itself as having answered a question nobody asked.
    const wanted = symbols && symbols.length > 0 ? symbols : DEFAULT_SYMBOLS;

    const outcomes: VenueOutcome[] = all.map((adapter) => ({
      id: adapter.id,
      label: adapter.label,
      ok: false,
      // Every venue is listed up front. A venue absent from the report reads as
      // "not asked", and a liquidations panel that silently omits the exchange
      // with the most of them is the failure mode this whole design avoids.
      error: adapter.supportsLiquidations ? null : "no liquidation feed",
      unsupported: !adapter.supportsLiquidations,
    }));

    const prints = (
      await Promise.all(
        publishing.map(async (adapter) => {
          try {
            const rows = await adapter.fetchLiquidations(wanted);
            const outcome = outcomes.find((entry) => entry.id === adapter.id);
            if (outcome) {
              outcome.ok = true;
              outcome.error = null;
              outcome.count = rows.length;
            }
            return rows;
          } catch (error) {
            const outcome = outcomes.find((entry) => entry.id === adapter.id);
            if (outcome) outcome.error = describe(error);
            return [] as LiquidationPrint[];
          }
        }),
      )
    ).flat();

    const covered = outcomes.filter((entry) => !entry.unsupported).length;
    const answered = outcomes.filter(
      (entry) => !entry.unsupported && entry.ok,
    ).length;

    // Only an empty tape from venues that all *answered* is a real "nothing
    // happened". An empty tape because every feed was blocked is a broken panel,
    // and the two must never render the same way.
    if (prints.length === 0 && answered === 0 && covered > 0) {
      if (this.lastGood) {
        return {
          ...this.lastGood,
          stale: true,
          staleReason: "every liquidation feed failed",
          venues: outcomes,
          generatedAt: Date.now(),
        };
      }
    }

    const snapshot = build(
      prints,
      outcomes,
      publishing.map((a) => ({ id: a.id, label: a.label })),
    );

    // An authoritative empty tape is a real answer and is cached; the old read
    // is kept only as the fallback for the blocked case above.
    if (prints.length > 0 || answered > 0) this.lastGood = snapshot;
    this.cache = { value: snapshot, expiresAt: Date.now() + TTL_MS };
    return snapshot;
  }
}

function build(
  prints: LiquidationPrint[],
  venues: VenueOutcome[],
  coverage: { id: string; label: string }[],
): LiquidationSnapshot {
  const now = Date.now();
  // Aligned to the bucket width so the series' buckets line up with the labels
  // rather than drifting by the request time on every refresh.
  const start = Math.floor((now - WINDOW_MS) / BUCKET_MS) * BUCKET_MS;

  const buckets: LiquidationBucket[] = Array.from(
    { length: BUCKET_COUNT },
    (_, i) => ({
      timestamp: start + i * BUCKET_MS,
      longUsd: 0,
      shortUsd: 0,
      totalUsd: 0,
      count: 0,
    }),
  );

  const bySymbol = new Map<
    string,
    { usd: number; longUsd: number; shortUsd: number; count: number }
  >();

  let windowUsd = 0;
  let windowLongUsd = 0;
  let windowShortUsd = 0;
  let largest: LiquidationPrint | null = null;

  for (const print of prints) {
    const usd = print.usd;
    // A print with no notional is still a print — it happened, and the count is
    // real — but it contributes nothing to a dollar column and is not dropped
    // from the tally either.
    const index = Math.floor((print.timestamp - start) / BUCKET_MS);

    if (index >= 0 && index < BUCKET_COUNT) {
      const bucket = buckets[index];
      if (bucket) {
        bucket.count += 1;
        if (usd !== null) {
          bucket.totalUsd += usd;
          if (print.side === "long") bucket.longUsd += usd;
          else bucket.shortUsd += usd;
        }
      }
    }

    if (usd !== null) {
      windowUsd += usd;
      if (print.side === "long") windowLongUsd += usd;
      else windowShortUsd += usd;

      const bucket = bySymbol.get(print.symbol) ?? {
        usd: 0,
        longUsd: 0,
        shortUsd: 0,
        count: 0,
      };
      bucket.usd += usd;
      if (print.side === "long") bucket.longUsd += usd;
      else bucket.shortUsd += usd;
      bucket.count += 1;
      bySymbol.set(print.symbol, bucket);

      if (largest === null || usd > (largest.usd ?? 0)) largest = print;
    }
  }

  return {
    buckets,
    windowUsd,
    windowLongUsd,
    windowShortUsd,
    printCount: prints.length,
    largest,
    bySymbol: [...bySymbol.entries()]
      .map(([symbol, value]) => ({ symbol, ...value }))
      .sort((a, b) => b.usd - a.usd)
      .slice(0, 12),
    burstRatio: burst(buckets),
    generatedAt: now,
    stale: false,
    staleReason: null,
    venues,
    coverage,
  };
}

/**
 * The last bucket against the median of the ones before it.
 *
 * The **median** rather than the mean, deliberately: one ordinary busy interval
 * should not define "normal" for the next two hours and hide a real cascade. A
 * ratio over the median answers the only question that matters — is this
 * interval out of character — and a median ignores its own outliers.
 *
 * Null rather than a number when the baseline is empty, because "infinite times
 * normal" is not a figure to put on a screen.
 */
function burst(buckets: LiquidationBucket[]): number | null {
  const latest = buckets.at(-1)?.totalUsd;
  const history = buckets.slice(0, -1).map((bucket) => bucket.totalUsd);
  if (latest === undefined || history.length === 0) return null;

  const sorted = [...history].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const baseline =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);

  if (baseline <= 0) return null;
  return latest / baseline;
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
