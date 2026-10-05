import "server-only";

import { CachedSource, describeError, toNumber } from "~/lib/cachedSource";
import { AppInject, AppSignleton } from "~/lib/container";
import { AxiosService } from "~/lib/axios";

import {
  gradeDivergence,
  mapPaprikaExchanges,
  mapPaprikaTicker,
  priceDivergencePercent,
  type CrossCheckReport,
  type PaprikaExchange,
  type PaprikaTicker,
} from "./priceCrossCheck.mapper";

/**
 * An independent second opinion on price, plus the free exchange ranking.
 *
 * **Why a second source matters.** Every other price in the app comes from either
 * CoinGecko or an exchange, and a single source cannot detect its own error: a
 * wrong figure from CoinGecko is displayed confidently and there is nothing on
 * screen to contradict it. CoinPaprika is a separate indexer with separate venue
 * coverage, so where the two disagree, that disagreement is *evidence* — and
 * where they agree, the confidence in the number is genuinely higher.
 *
 * CoinPaprika needs no key, which is unusual for a full coin index and is the
 * reason it was chosen over CoinCap or CryptoCompare, both of which have moved
 * behind a signup since they were last keyless.
 */

const PAPRIKA = "https://api.coinpaprika.com/v1";
const COINLORE = "https://api.coinlore.net/api";

const REQUEST_TIMEOUT_MS = 12_000;

/** CoinPaprika's free tier is generous but the index route is 7.5 MB. */
const TICKERS_TTL_MS = 10 * 60_000;

/** The index changes a handful of times a day at most. */
const EXCHANGES_TTL_MS = 60 * 60_000;

export type PaprikaTickerReport = {
  tickers: PaprikaTicker[];
  exchanges: PaprikaExchange[];
  /** CoinPaprika's own aggregate, for a market-wide comparison. */
  global: {
    marketCapUsd: number | null;
    volume24hUsd: number | null;
    marketCapChange24h: number | null;
    /** Published as `56.5` for 56.5%, i.e. already a percentage. */
    btcDominance: number | null;
    /** How far total market cap sits below its all-time high, percent. */
    fromAth: number | null;
    athValue: number | null;
    athDate: string | null;
    coinsTracked: number | null;
    /** Unix seconds. */
    lastUpdated: number | null;
  };
  sources: CrossCheckReport["sources"];
  fetchedAt: number;
  stale: boolean;
  error: string | null;
};

/**
 * Coins compared against the app's own prices, as `{symbol, usd}` pairs.
 *
 * Passed in rather than re-fetched, because the primary prices are already in
 * memory in the overview service and a second call for them would be both slower
 * and less accurate — the whole point is comparing this snapshot against
 * Paprika's, at the same moment.
 */
export type PrimaryPrice = { symbol: string; usd: number | null };

@AppSignleton()
export default class PriceCrossCheckService {
  private readonly tickers: CachedSource<PaprikaTicker[]>;
  private readonly exchanges: CachedSource<PaprikaExchange[]>;
  private readonly global: CachedSource<PaprikaTickerReport["global"]>;

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {
    this.tickers = new CachedSource<PaprikaTicker[]>({
      ttlMs: TICKERS_TTL_MS,
      load: async () => {
        const { data } = await this.http.get<unknown>(`${PAPRIKA}/tickers`, {
          timeout: 20_000,
        });
        if (!Array.isArray(data)) throw new Error("Paprika returned no ticker list");
        return data
          .map(mapPaprikaTicker)
          .filter((ticker): ticker is PaprikaTicker => ticker !== null);
      },
      empty: () => [],
    });

    this.global = new CachedSource<PaprikaTickerReport["global"]>({
      ttlMs: TICKERS_TTL_MS,
      load: async () => {
        const { data } = await this.http.get<unknown>(`${PAPRIKA}/global`);
        const row = (data ?? {}) as Record<string, unknown>;

        /**
         * Paprika spells these `market_cap_change_24h` and
         * `bitcoin_dominance_percentage`, with **no `_usd` suffix**.
         * The `_usd` variants an earlier version of this code read do not exist,
         * which is why the 24h change and the dominance figure both read as null
         * while market cap and volume — which do match — came through fine.
         */
        return {
          marketCapUsd: toNumber(row.market_cap_usd),
          volume24hUsd: toNumber(row.volume_24h_usd),
          marketCapChange24h: toNumber(row.market_cap_change_24h),
          /** Published as 56.5 for 56.5%, i.e. already a percentage. */
          btcDominance: toNumber(row.bitcoin_dominance_percentage),
          /**
           * Paprika names this `market_cap_percent_from_ath` on some responses and
           * `volume_24h_percent_from_ath` on others; there is no single
           * market-cap equivalent in the payload, so both spellings are read and
           * the volume one is only used when nothing else is available.
           */
          fromAth:
            toNumber(row.market_cap_percent_from_ath) ??
            toNumber(row.market_cap_from_ath) ??
            null,
          athValue: toNumber(row.market_cap_ath_value),
          athDate: typeof row.market_cap_ath_date === "string" ? row.market_cap_ath_date : null,
          coinsTracked: toNumber(row.cryptocurrencies_number),
          lastUpdated: typeof row.last_updated === "number" ? row.last_updated : null,
        };
      },
      empty: () => ({
        marketCapUsd: null,
        volume24hUsd: null,
        marketCapChange24h: null,
        btcDominance: null,
        fromAth: null,
        athValue: null,
        athDate: null,
        coinsTracked: null,
        lastUpdated: null,
      }),
    });

    this.exchanges = new CachedSource<PaprikaExchange[]>({
      ttlMs: EXCHANGES_TTL_MS,
      load: async () => {
        const { data } = await this.http.get<unknown>(`${PAPRIKA}/exchanges`, {
          timeout: 20_000,
        });
        if (!Array.isArray(data)) throw new Error("Paprika returned no exchange list");

        // Each exchange's share needs the market-wide volume, so the global read
        // is joined in rather than fetched N times.
        const globalEnvelope = await this.global.read();
        return mapPaprikaExchanges(data, globalEnvelope.data.volume24hUsd);
      },
      empty: () => [],
    });
  }

  /** Paprika's full ticker list, for a standalone price table. */
  async getTickers(
    options: { limit?: number; force?: boolean } = {},
  ): Promise<PaprikaTickerReport> {
    const [tickers, global, exchanges] = await Promise.all([
      this.tickers.read({ force: options.force }),
      this.global.read({ force: options.force }),
      this.exchanges.read({ force: options.force }),
    ]);

    const ranked = [...tickers.data].sort(
      (a, b) => (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1),
    );

    return {
      tickers: ranked.slice(0, options.limit ?? 60),
      exchanges: exchanges.data
        // Ranked by volume, with venues that report none pushed below those that
        // do rather than mixed in at the bottom as nulls.
        .sort((a, b) => (b.volume24h ?? -1) - (a.volume24h ?? -1))
        .slice(0, 20),
      global: global.data,
      sources: [
        {
          id: "coinpaprika",
          label: "CoinPaprika",
          ok: !tickers.error,
          error: tickers.error,
        },
      ],
      fetchedAt: Math.max(tickers.fetchedAt, global.fetchedAt),
      stale: tickers.stale || global.stale,
      error: tickers.error ?? global.error,
    };
  }

  /**
   * Compare the app's own prices against Paprika's, symbol by symbol.
   *
   * A source that fails is reported as failed rather than silently dropping the
   * coins it would have covered — an empty comparison table and a table where
   * every coin happens to agree look identical otherwise.
   */
  async compare(
    primary: PrimaryPrice[],
    options: { force?: boolean } = {},
  ): Promise<CrossCheckReport> {
    const paprika = await this.tickers.read({ force: options.force });

    if (paprika.error && paprika.data.length === 0) {
      return {
        rows: [],
        sources: [
          {
            id: "coinpaprika",
            label: "CoinPaprika",
            ok: false,
            error: paprika.error,
          },
        ],
        totals: {
          compared: 0,
          diverging: 0,
          worstDivergencePercent: null,
          meanDivergencePercent: null,
        },
        fetchedAt: paprika.fetchedAt,
        stale: true,
        error: paprika.error,
      };
    }

    const bySymbol = new Map(
      paprika.data.map((ticker) => [ticker.symbol.toUpperCase(), ticker]),
    );

    const rows = primary
      .map((entry): CrossCheckReport["rows"][number] | null => {
        const symbol = entry.symbol.toUpperCase();
        const match = bySymbol.get(symbol);
        if (!match) return null;

        const divergence = priceDivergencePercent(entry.usd, match.priceUsd);

        return {
          symbol,
          name: match.name,
          primaryUsd: entry.usd,
          secondaryUsd: match.priceUsd,
          divergencePercent: divergence,
          status: gradeDivergence(divergence),
        };
      })
      .filter((row): row is CrossCheckReport["rows"][number] => row !== null);

    const divergences = rows
      .map((row) => Math.abs(row.divergencePercent ?? 0))
      .filter((value) => value > 0);

    return {
      rows,
      sources: [
        {
          id: "coinpaprika",
          label: "CoinPaprika",
          ok: true,
          error: null,
        },
      ],
      totals: {
        compared: rows.length,
        diverging: rows.filter((row) => row.status === "diverging").length,
        worstDivergencePercent: divergences.length
          ? Math.max(...divergences)
          : null,
        meanDivergencePercent: divergences.length
          ? divergences.reduce((sum, value) => sum + value, 0) / divergences.length
          : null,
      },
      fetchedAt: paprika.fetchedAt,
      stale: paprika.stale,
      error: paprika.error,
    };
  }

  /**
   * A reachability probe for CoinLore.
   *
   * CoinLore is kept as a third, deliberately cheap source rather than a main one:
   * a single-coin endpoint that answers in a few hundred bytes, useful for
   * confirming a divergence rather than for building a board from.
   */
  async probeCoinLore(symbol = "btc"): Promise<{
    id: string;
    label: string;
    ok: boolean;
    error: string | null;
  }> {
    try {
      const { data } = await this.http.get<unknown>(
        `${COINLORE}/ticker/?id=${encodeURIComponent(symbol)}`,
        { timeout: REQUEST_TIMEOUT_MS },
      );
      const list = Array.isArray(data) ? data : [];
      return {
        id: "coinlore",
        label: "CoinLore",
        ok: list.length > 0,
        error: list.length > 0 ? null : "no ticker returned",
      };
    } catch (error) {
      return {
        id: "coinlore",
        label: "CoinLore",
        ok: false,
        error: describeError(error),
      };
    }
  }
}

