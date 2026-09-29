/** Instrument groups exposed by the nerkh.io live endpoint. */
export type NerkhGroup = "gold" | "currency" | "crypto";

/** The two rolling windows nerkh.io publishes alongside every price. */
export type NerkhWindow = "1hour" | "12hour";

export const NERKH_WINDOWS: readonly NerkhWindow[] = ["1hour", "12hour"];

export type NerkhQuote = {
  /** Instrument id exactly as nerkh.io publishes it, e.g. `GOLD18K`. */
  key: string;
  group: NerkhGroup;
  /** Toman, the unit nerkh.io quotes in. */
  current: number;
  min: Record<NerkhWindow, number | null>;
  max: Record<NerkhWindow, number | null>;
  /** Verbatim Jalali timestamp from the feed, kept for display. */
  updatedLabel: string;
  /** Short in-process series used for the sparkline and drift estimate. */
  spark: number[];
};

export type NerkhSnapshot = {
  quotes: NerkhQuote[];
  /** Epoch ms the snapshot was assembled. */
  fetchedAt: number;
  /** Epoch seconds reported upstream, when present. */
  upstreamTimestamp: number | null;
  /** Verbatim Jalali date string from the feed. */
  upstreamDate: string | null;
  /** Groups that could not be crawled on this run. */
  unavailable: string[];
  /** True when the crawler served an older snapshot after a failed refresh. */
  stale: boolean;
  /** Populated only when `stale` is true. */
  error: string | null;
};

/** Toman -> Rial. Iranian retail quotes are Toman, contracts are Rial. */
export const RIAL_PER_TOMAN = 10;

/** Convenience lookup for a single instrument inside a snapshot. */
export function findQuote(
  snapshot: NerkhSnapshot | undefined,
  key: string,
): NerkhQuote | undefined {
  return snapshot?.quotes.find((quote) => quote.key === key);
}

/**
 * Percentage change of `current` against the middle of the given window, which
 * is the only position-free reference nerkh.io publishes. Positive means the
 * price is in the upper half of the window's range.
 */
export function windowBiasPercent(
  quote: NerkhQuote,
  window: NerkhWindow,
): number | null {
  const low = quote.min[window];
  const high = quote.max[window];
  if (low === null || high === null || high <= low) return null;
  return ((quote.current - low) / (high - low) - 0.5) * 2;
}

/** Distance of `current` from the low edge of the window, in percent. */
export function windowRangePercent(
  quote: NerkhQuote,
  window: NerkhWindow,
): number | null {
  const low = quote.min[window];
  const high = quote.max[window];
  if (low === null || high === null || high <= 0) return null;
  return ((quote.current - low) / high) * 100;
}

/** Change of the latest sample against the oldest one in the spark series. */
export function sparkChangePercent(quote: NerkhQuote): number | null {
  const series = quote.spark;
  if (series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  if (first === undefined || last === undefined || first === 0) return null;
  return ((last - first) / first) * 100;
}
