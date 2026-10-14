/**
 * Canonical TGJU instrument ids.
 *
 * They intentionally match the nerkh.io keys for the same instruments, so the
 * board mapper can share label keys and category logic between the two
 * aggregators instead of learning a second naming scheme.
 */
export type TgjuKey =
  | "USDT"
  | "USD"
  | "GOLD18K"
  | "GOLD24K"
  | "SEKE_EMAMI"
  | "SEKE_NIM"
  | "SEKE_ROB";

export type TgjuQuote = {
  key: TgjuKey;
  /** Rial, the unit TGJU quotes in (its tables are headed ریال). */
  price: number;
  low: number | null;
  high: number | null;
  /** Day change in percent, when the board cell carries one. */
  changePercent: number | null;
  /** Verbatim time label from the feed, kept for display. */
  updatedLabel: string;
};

/** One Iranian exchange line from the `markets-local` USDT table. */
export type TgjuExchangeRow = {
  /** Persian display name as TGJU prints it, e.g. `نوبیتکس`. */
  exchangeFa: string;
  /** URL slug of the exchange listing, used as the stable row id. */
  exchangeSlug: string;
  /** Pair as TGJU prints it, e.g. `USDT / IRR`. */
  pair: string;
  /** Sell price (فروش) in Rial. */
  sell: number | null;
  /** Buy price (خرید) in Rial. */
  buy: number | null;
  high: number | null;
  low: number | null;
  changePercent: number | null;
  updatedLabel: string;
};

export type TgjuSnapshot = {
  quotes: TgjuQuote[];
  exchanges: TgjuExchangeRow[];
  /** Epoch ms the snapshot was assembled. */
  fetchedAt: number;
  /** Page ids that could not be crawled on this run. */
  unavailable: string[];
  /** True when the crawler served an older snapshot after a failed refresh. */
  stale: boolean;
  error: string | null;
};

export const TGJU_KEYS: readonly TgjuKey[] = [
  "USDT",
  "USD",
  "GOLD18K",
  "GOLD24K",
  "SEKE_EMAMI",
  "SEKE_NIM",
  "SEKE_ROB",
];
