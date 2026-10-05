import "server-only";

import { toNumber } from "~/lib/cachedSource";

/**
 * Polymarket's Gamma API shapes.
 *
 * Prediction markets are the only place in crypto where a **live, money-backed
 * probability** is published continuously and for free. That is a genuinely
 * different signal from a technical indicator or a sentiment score: it is what
 * people with capital think the odds are, not what a model infers from price.
 *
 * Gamma sends `outcomes` and `outcomePrices` as JSON **strings** inside an array,
 * which is unusual enough to be worth a comment — parsing them as arrays
 * silently yields nothing, and the market would read as having no price.
 */

export type PredictionMarket = {
  id: string;
  question: string;
  slug: string;
  /** Resolved market close, ISO string. */
  endDate: string | null;
  /** Market cap in USDC — the money actually committed. */
  liquidity: number | null;
  volume24h: number | null;
  volumeTotal: number | null;
  /** `["Yes", "No"]` and `["0.63", "0.37"]` respectively. */
  outcomes: string[];
  /** Probability per outcome, 0..1, aligned with `outcomes`. */
  prices: number[];
  /**
   * The highest single probability, which is how a binary market is usually
   * read. Null when the market is unquoted.
   */
  topProbability: number | null;
  /** Which outcome that probability belongs to. */
  topOutcome: string | null;
  /** The underdog's probability — how much the market is saying no. */
  underdogProbability: number | null;
  underdogOutcome: string | null;
  /**
   * True when the two prices do not sum to 1. Polymarket charges a spread, so a
   * small gap is normal; a large one means the quote is stale or partial.
   */
  bookImbalance: number | null;
  image: string | null;
  description: string | null;
};

export type PredictionSnapshot = {
  markets: PredictionMarket[];
  totals: {
    markets: number;
    liquidity: number;
    volume24h: number;
    /** Markets with a top probability at or above 90%. */
    nearSettled: number;
  };
  /**
   * How many of the fetched markets the crypto filter discarded.
   *
   * Reported rather than hidden, because Polymarket's top markets are dominated
   * by elections and geopolitics — so a reader seeing four crypto markets should
   * know the raw response held two hundred.
   */
  filteredOut: number;
  fetchedAt: number;
  stale: boolean;
  error: string | null;
};

/**
 * Parses Gamma's JSON-in-a-string fields.
 *
 * A double-encoded string is a real failure mode here: `JSON.parse` on an
 * already-parsed array throws, and on a malformed string throws again. Both
 * collapse to an empty array rather than propagating, because a market with an
 * unreadable price list should still show its question and volume.
 */
function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function mapMarket(value: unknown): PredictionMarket | null {
  const row = asRecord(value);
  const id = asString(row.id);
  const question = asString(row.question);
  if (!id || !question) return null;

  const outcomes = parseJsonArray(row.outcomes)
    .map((outcome) => (typeof outcome === "string" ? outcome : null))
    .filter((outcome): outcome is string => outcome !== null);

  // Gamma quotes probabilities as decimal strings, e.g. `"0.63"`. A value
  // above 1 would be a percentage rather than a probability, so both readings
  // are accepted rather than one being assumed.
  const prices = parseJsonArray(row.outcomePrices)
    .map((price) => {
      const parsed = toNumber(price);
      if (parsed === null) return null;
      return parsed > 1 ? parsed / 100 : parsed;
    })
    .filter((price): price is number => price !== null && price >= 0);

  let topProbability: number | null = null;
  let topIndex = -1;
  prices.forEach((price, index) => {
    if (topProbability === null || price > topProbability) {
      topProbability = price;
      topIndex = index;
    }
  });

  // The underdog is the *lowest* quoted outcome, not `1 - topProbability`.
  // They differ when the book carries a spread, and using the complement would
  // report a price the market does not actually offer.
  let underdogProbability: number | null = null;
  let underdogIndex = -1;
  prices.forEach((price, index) => {
    if (underdogProbability === null || price < underdogProbability) {
      underdogProbability = price;
      underdogIndex = index;
    }
  });

  const sum = prices.reduce((total, price) => total + price, 0);

  return {
    id,
    question,
    slug: asString(row.slug) ?? id,
    endDate: asString(row.endDate),
    liquidity: toNumber(row.liquidity),
    volume24h: toNumber(row.volume24h),
    volumeTotal: toNumber(row.volumeNum ?? row.volume),
    outcomes,
    prices,
    topProbability,
    topOutcome: topIndex >= 0 ? (outcomes[topIndex] ?? null) : null,
    underdogProbability,
    underdogOutcome: underdogIndex >= 0 ? (outcomes[underdogIndex] ?? null) : null,
    // Null rather than 0 when there is nothing quoted: "no book" is not a
    // balanced book.
    bookImbalance: prices.length >= 2 ? sum : null,
    image: asString(row.image) ?? asString(row.icon),
    description: asString(row.description),
  };
}

/**
 * Filters to the markets a crypto dashboard can actually say something about.
 *
 * Polymarket covers elections and geopolitics, which would fill a crypto panel
 * with questions about foreign elections. The keyword list is the filter that
 * keeps the panel on-topic: only markets naming a crypto-relevant subject are
 * kept.
 */
const CRYPTO_TERMS = [
  "bitcoin",
  "btc",
  "ethereum",
  "eth",
  "solana",
  "sol",
  "crypto",
  "cryptocurrency",
  "blockchain",
  "defi",
  "stablecoin",
  "token",
  "xrp",
  "dogecoin",
  "doge",
  "nft",
  "usdt",
  "usdc",
  "coinbase",
  "binance",
  "sec ",
  "microstrategy",
  "tether",
  "ripple",
  "cardano",
  "polkadot",
  "avalanche",
  "hyperliquid",
];

export function isCryptoMarket(market: PredictionMarket): boolean {
  const haystack = market.question.toLowerCase();
  return CRYPTO_TERMS.some((term) => haystack.includes(term));
}

/** Percentage form of a probability, for display. */
export function probabilityPercent(value: number | null): number | null {
  return value === null ? null : value * 100;
}