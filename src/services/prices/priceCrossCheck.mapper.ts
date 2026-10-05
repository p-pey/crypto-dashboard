import "server-only";

import { safeRatio, toNumber } from "~/lib/cachedSource";

/**
 * CoinPaprika and CoinLore shapes.
 *
 * Both exist for one reason: **an independent second opinion on price**. Every
 * other source in the app quotes either CoinGecko or an exchange, and a single
 * source cannot reveal its own error. CoinPaprika is entirely independent of
 * CoinGecko — separate indexers, separate exchange coverage — so a disagreement
 * between them is real information rather than a shared upstream fault.
 */

export type PaprikaTicker = {
  id: string;
  name: string;
  symbol: string;
  /** CoinPaprika's own pair id, which is `<coin>-<name>`, e.g. `btc-bitcoin`. */
  pairId: string;
  rank: number | null;
  priceUsd: number | null;
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
  volume24h: number | null;
  marketCapUsd: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  /** 24h volume ÷ market cap, 0..1. Turns over faster than 1 means heavy churn. */
  volToMarketCap: number | null;
  /**
   * When CoinPaprika last refreshed this quote.
   *
   * An index can lag the market by seconds or by hours depending on its venue
   * coverage, and a stale index is the most likely explanation for a divergence
   * that would otherwise look like an error in the primary source.
   */
  lastUpdated: string | null;
};

export type PaprikaExchange = {
  id: string;
  name: string;
  /** Wash-adjusted 24h volume, USD. This is what the ranking uses. */
  volume24h: number | null;
  /** Volume as the venue itself reports it. Kept so the adjustment is visible. */
  reportedVolume24h: number | null;
  /** Share of the total tracked volume, 0..1. */
  volumeShare: number | null;
  /**
   * CoinPaprika's 1..10 trust grade, where **1 is most trustworthy**.
   * Kept numeric so it can be sorted, and the sort direction is the caller's
   * responsibility.
   */
  trustScore: number | null;
  /** The venue's own website. */
  website: string | null;
  /** The venue's own trading page. */
  tradeUrl: string | null;
  /** Number of listed markets, i.e. how broad the venue's coverage is. */
  markets: number | null;
  /** Monthly visitor sessions, as CoinPaprika estimates them. */
  sessionsPerMonth: number | null;
  /** CoinPaprika's own 0..1 confidence in this row. */
  confidence: number | null;
  /** Active with a reachable API. An inactive venue is not a usable one. */
  isActive: boolean;
  /** CoinPaprika's venue types, e.g. `["cex"]`. */
  types: string[];
  /** Free-text notice from CoinPaprika, often a security disclosure. */
  notice: string | null;
  lastUpdated: string | null;
};

/**
 * Which source to believe is **not** decided here.
 *
 * Exchanges price in milliseconds while an index aggregates every venue, so on a
 * coin that has just moved sharply the two legitimately differ. The verdict is
 * therefore a statement about the *size* of the gap, not a claim that one side is
 * wrong — and the threshold is loose for that reason.
 */
export type CrossCheckRow = {
  symbol: string;
  name: string;
  /** The figure the rest of the app already shows. */
  primaryUsd: number | null;
  /** The independent figure. */
  secondaryUsd: number | null;
  /** Signed gap, percent. Null when either side is missing. */
  divergencePercent: number | null;
  /** `one-sided` means the independent source has no entry for this symbol. */
  status: "agree" | "diverging" | "one-sided";
};

export type CrossCheckReport = {
  rows: CrossCheckRow[];
  /** Sources that answered, named. */
  sources: { id: string; label: string; ok: boolean; error: string | null }[];
  totals: {
    compared: number;
    /** Rows whose gap exceeded the threshold. */
    diverging: number;
    /** Largest absolute gap seen. */
    worstDivergencePercent: number | null;
    meanDivergencePercent: number | null;
  };
  fetchedAt: number;
  stale: boolean;
  error: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * CoinPaprika nests every market figure under `quotes.USD`.
 *
 * The shape that matters for correctness: **`/v1/tickers` does not carry
 * `price_usd`, `market_cap_usd` or `volume_24h` at the top level at all** — those
 * are the fields of the single-ticker route `/v1/tickers/btc-bitcoin`. Reading the
 * list route as if it were the single route produces a full 2,000-coin table with
 * every price, market cap and volume null, which looks like an upstream outage
 * rather than a path mix-up.
 *
 * `last_updated` also moves under this object, which is how a stale index is
 * detected rather than being read as a live quote.
 */
export function mapPaprikaTicker(value: unknown): PaprikaTicker | null {
  const row = asRecord(value);
  const id = asString(row.id);
  const symbol = asString(row.symbol);
  if (!id || !symbol) return null;

  const quote = asRecord(asRecord(row.quotes).USD);

  const priceUsd = toNumber(quote.price);
  const marketCapUsd = toNumber(quote.market_cap);
  const volume24h = toNumber(quote.volume_24h);

  return {
    id,
    name: asString(row.name) ?? symbol,
    symbol: symbol.toUpperCase(),
    pairId: id,
    rank: toNumber(row.rank),
    priceUsd,
    // The list route spells this `percent_change_24h`; the single-ticker route
    // uses `percent_change_1h`/`_12h`/`_24h`. Both spellings are read so one
    // mapper serves both routes.
    change24h: toNumber(quote.percent_change_24h ?? quote.percent_change_24h),
    change7d: toNumber(quote.percent_change_7d),
    change30d: toNumber(quote.percent_change_30d),
    volume24h,
    marketCapUsd,
    circulatingSupply: toNumber(row.circulating_supply),
    totalSupply: toNumber(row.total_supply),
    maxSupply: toNumber(row.max_supply),
    volToMarketCap: safeRatio(volume24h, marketCapUsd),
    lastUpdated: asString(quote.last_updated) ?? asString(row.last_updated),
  };
}

/**
 * CoinPaprika's exchange list, which is the free answer to "which exchanges are
 * biggest" — a ranking CoinMarketCap charges a Pro tier for.
 *
 * **The list route nests its figures, like `/v1/tickers` does.** An exchange's
 * volume is at `quotes.USD.volume_24h`, its trust grade at
 * `quotes.trust_score`, and its link at `links.website`, while its own `url` field
 * is a CoinPaprika page and its own `message` is a free-text notice that can carry
 * anything at all — including a hack disclosure. Reading the top-level names yields
 * a list of exchanges all showing null volume and no URLs.
 */
export function mapPaprikaExchanges(
  value: unknown,
  totalVolume: number | null,
): PaprikaExchange[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry): PaprikaExchange | null => {
      const row = asRecord(entry);
      const id = asString(row.id);
      if (!id) return null;

      const quote = asRecord(asRecord(row.quotes).USD);
      const links = asRecord(row.links);

      /**
       * Volume is `adjusted_volume_24h`, not `reported_volume_24h`.
       *
       * Both are present and they differ: CoinPaprika subtracts volume it can
       * attribute to wash trading, and the two fields are identical on the venues
       * checked so far. The adjusted figure is preferred because a ranking built
       * on reported volume inherits every inflated number the venue publishes,
       * and the reported figure is kept alongside so the difference is visible
       * rather than hidden.
       */
      const volume24h =
        toNumber(quote.adjusted_volume_24h) ?? toNumber(quote.reported_volume_24h);
      const reportedVolume24h = toNumber(quote.reported_volume_24h);

      /**
       * Trust is a 1..10 grade where **1 is most trustworthy**, so any sort on
       * this field must be ascending. It sits at `quotes.trust_score`, not at the
       * exchange's top level.
       */
      const trustScore = toNumber(quote.trust_score);

      const types = Array.isArray(row.type)
        ? row.type.filter((t): t is string => typeof t === "string")
        : [];

      return {
        id,
        name: asString(row.name) ?? id,
        volume24h,
        reportedVolume24h,
        volumeShare: safeRatio(volume24h, totalVolume),
        trustScore,
        website: asString(links.website),
        tradeUrl: asString(links.trade),
        /** Number of listed markets, i.e. how broad the venue's coverage is. */
        markets: toNumber(row.markets) ?? toNumber(row.currencies),
        sessionsPerMonth: toNumber(row.sessions_per_month),
        confidence: toNumber(row.confidence_score),
        isActive: row.active === true && row.api_status === true,
        types,
        /**
         * CoinPaprika's own free-text notice, kept verbatim.
         *
         * It is not editorial content this app produces, and it is frequently a
         * security disclosure — "hacked for approx $350M" appeared on Bitget's row
         * during development. Surfacing it is more honest than filtering
         * untrusted-looking text out of a venue's own record.
         */
        notice: asString(row.message),
        lastUpdated: asString(row.last_updated),
      };
    })
    .filter((row): row is PaprikaExchange => row !== null);
}

/**
 * Grades a divergence between two price sources.
 *
 * The threshold is deliberately loose. Exchanges price in milliseconds while an
 * index aggregates every venue, so on a coin that moved sharply the two will
 * *legitimately* differ by a percent or two. A 1% threshold separates "these are
 * telling the same story" from "these are quoting different things", and calling
 * a routine index-versus-exchange gap a discrepancy would cry wolf.
 */
export const DIVERGENCE_THRESHOLD_PERCENT = 1;

export function gradeDivergence(
  divergencePercent: number | null,
): CrossCheckRow["status"] {
  if (divergencePercent === null) return "one-sided";
  if (Math.abs(divergencePercent) <= DIVERGENCE_THRESHOLD_PERCENT) return "agree";
  return "diverging";
}

/** Gap between two prices, in percent, or null when either side is missing. */
export function priceDivergencePercent(
  primary: number | null,
  secondary: number | null,
): number | null {
  if (primary === null || secondary === null) return null;
  if (primary <= 0 || secondary <= 0) return null;
  return ((secondary - primary) / primary) * 100;
}