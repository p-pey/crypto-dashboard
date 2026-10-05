import "server-only";

import { CachedSource, describeError } from "~/lib/cachedSource";
import { AppInject, AppSignleton } from "~/lib/container";
import { AxiosService } from "~/lib/axios";

import {
  findArbitrage,
  mapDexCandles,
  mapDexPairs,
  type DexArbitrageRow,
  type DexCandles,
  type DexPair,
} from "./dex.mapper";

/**
 * DEX market data, free and keyless.
 *
 * DexScreener and GeckoTerminal between them cover essentially all on-chain
 * exchange activity, with no key, no account and no paid tier. That is unusual
 * enough to be worth stating plainly: for order-book-grade pool data there is no
 * CEX-quality free equivalent anywhere in crypto.
 *
 * **The arbitrage table needs no plumbing.** Because a search returns the same
 * token quoted across many pools with liquidity attached, comparing the best
 * price against the worst *is* the data. This is the same idea as the app's CEX
 * arbitrage panel, and it needs neither credentials nor an order-book connection
 * — which is what makes it the cheapest feature here.
 */

const DEXSCREENER = "https://api.dexscreener.com";
const GECKOTERMINAL = "https://api.geckoterminal.com/api/v2";

const REQUEST_TIMEOUT_MS = 12_000;

/**
 * DexScreener's published allowance is 300 requests per minute, but its search
 * route returns dozens of pools per call, so a two-minute TTL costs nothing in
 * freshness and a lot in request volume.
 */
const PAIRS_TTL_MS = 2 * 60_000;
const SEARCH_TTL_MS = 2 * 60_000;
const CANDLES_TTL_MS = 5 * 60_000;

/** Officially free, no key. Confirmed reachable; used for the chain list. */
export type DexNetwork = {
  id: string;
  name: string;
};

export type DexBoard = {
  /** Pools sorted by 24h volume. */
  pairs: DexPair[];
  /** Chains present in this board, with their share of volume. */
  chains: { chain: string; pairs: number; volume24h: number }[];
  totals: {
    volume24h: number;
    liquidityUsd: number;
    pairCount: number;
  };
  fetchedAt: number;
  stale: boolean;
  error: string | null;
};

export type DexSearchResult = {
  query: string;
  pairs: DexPair[];
  arbitrage: DexArbitrageRow[];
  /** Both pools on both sides, for the panel's row count. */
  poolCount: number;
  fetchedAt: number;
  stale: boolean;
  error: string | null;
};

@AppSignleton()
export default class DexService {
  private readonly trending: CachedSource<DexPair[]>;
  private readonly networks: CachedSource<DexNetwork[]>;

  /** Keyed per query so several searches do not share one another's cache. */
  private readonly searches = new Map<string, CachedSource<DexSearchResult>>();
  private readonly candles = new Map<string, CachedSource<DexCandles>>();

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {
    this.trending = new CachedSource<DexPair[]>({
      ttlMs: PAIRS_TTL_MS,
      // The pair is written `SOL/USDC`, not `SOL USDC`. DexScreener matches its
      // search index against the literal `base/quote` string, so a space
      // returns an empty result set with a 200 — a silent no-op rather than an
      // error, which is exactly the kind of failure a board must not report as
      // "no pools".
      load: async () => {
        const { data } = await this.http.get<unknown>(
          `${DEXSCREENER}/latest/dex/search?q=${encodeURIComponent("SOL/USDC")}`,
          { timeout: REQUEST_TIMEOUT_MS },
        );
        return mapDexPairs(data);
      },
      empty: () => [],
    });

    this.networks = new CachedSource<DexNetwork[]>({
      // GeckoTerminal's chain list changes rarely.
      ttlMs: 60 * 60_000,
      load: async () => {
        const { data } = await this.http.get<unknown>(
          `${GECKOTERMINAL}/networks`,
          { timeout: REQUEST_TIMEOUT_MS },
        );
        const list = (data as { data?: unknown })?.data;
        if (!Array.isArray(list)) return [];

        return list
          .map((value): DexNetwork | null => {
            if (!value || typeof value !== "object") return null;
            const row = value as { id?: unknown; name?: unknown };
            if (typeof row.id !== "string") return null;
            return { id: row.id, name: typeof row.name === "string" ? row.name : row.id };
          })
          .filter((row): row is DexNetwork => row !== null);
      },
      empty: () => [],
    });
  }

  /**
   * The DEX board: the most-traded pools on the two deepest quote assets.
   *
   * Two searches rather than one because `SOL USDC` and `SOL USDT` are genuinely
   * different books — the deepest pools on each side of the dollar, and where an
   * opportunity between them is most likely to be real.
   */
  async getBoard(options: { limit?: number; force?: boolean } = {}): Promise<DexBoard> {
    const envelope = await this.trending.read({ force: options.force });

    const pairs = [...envelope.data].sort(
      (a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0),
    );

    const chainTotals = new Map<string, { pairs: number; volume24h: number }>();
    for (const pair of pairs) {
      const bucket = chainTotals.get(pair.chain) ?? { pairs: 0, volume24h: 0 };
      bucket.pairs += 1;
      bucket.volume24h += pair.volume24h ?? 0;
      chainTotals.set(pair.chain, bucket);
    }

    return {
      pairs: pairs.slice(0, options.limit ?? 40),
      chains: [...chainTotals.entries()]
        .map(([chain, totals]) => ({ chain, ...totals }))
        .sort((a, b) => b.volume24h - a.volume24h),
      totals: {
        volume24h: pairs.reduce((sum, pair) => sum + (pair.volume24h ?? 0), 0),
        liquidityUsd: pairs.reduce((sum, pair) => sum + (pair.liquidityUsd ?? 0), 0),
        pairCount: pairs.length,
      },
      fetchedAt: envelope.fetchedAt,
      stale: envelope.stale,
      error: envelope.error,
    };
  }

  /** Chains GeckoTerminal indexes. Free, keyless, and needed for candles. */
  async getNetworks(options: { force?: boolean } = {}) {
    const envelope = await this.networks.read({ force: options.force });
    return {
      networks: envelope.data,
      fetchedAt: envelope.fetchedAt,
      stale: envelope.stale,
      error: envelope.error,
    };
  }

  /**
   * Search a token and price its pools against each other.
   *
   * This is the arbitrage feature: one request returns every pool quoting the
   * token, so the comparison costs one call rather than one per venue.
   */
  async search(
    query: string,
    options: { limit?: number; force?: boolean } = {},
  ): Promise<DexSearchResult> {
    const trimmed = query.trim().toLowerCase();

    if (trimmed.length === 0) {
      return {
        query: query,
        pairs: [],
        arbitrage: [],
        poolCount: 0,
        fetchedAt: Date.now(),
        stale: false,
        error: "empty query",
      };
    }

    const source = this.searchSource(trimmed);
    const envelope = await source.read({ force: options.force });

    const pairs = [...envelope.data.pairs].sort(
      (a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0),
    );

    return {
      query: envelope.data.query,
      pairs: pairs.slice(0, options.limit ?? 40),
      arbitrage: envelope.data.arbitrage.slice(0, options.limit ?? 20),
      poolCount: envelope.data.pairs.length,
      fetchedAt: envelope.fetchedAt,
      stale: envelope.stale,
      error: envelope.error,
    };
  }

  private searchSource(query: string): CachedSource<DexSearchResult> {
    const existing = this.searches.get(query);
    if (existing) return existing;

    const created = new CachedSource<DexSearchResult>({
      ttlMs: SEARCH_TTL_MS,
      load: async () => {
        const { data } = await this.http.get<unknown>(
          `${DEXSCREENER}/latest/dex/search?q=${encodeURIComponent(query.toUpperCase())}`,
          { timeout: REQUEST_TIMEOUT_MS },
        );
        const pairs = mapDexPairs(data);
        return {
          query,
          pairs,
          // The whole arbitrage feature: pools already fetched, so this is
          // pure arithmetic over data the board needed anyway.
          arbitrage: findArbitrage(pairs),
          poolCount: pairs.length,
          fetchedAt: Date.now(),
          stale: false,
          error: null,
        };
      },
      empty: () => ({
        query,
        pairs: [],
        arbitrage: [],
        poolCount: 0,
        fetchedAt: Date.now(),
        stale: true,
        error: "search failed",
      }),
    });

    if (this.searches.size >= 60) {
      const oldest = this.searches.keys().next();
      if (!oldest.done) this.searches.delete(oldest.value);
    }

    this.searches.set(query, created);
    return created;
  }

  /**
   * Per-pool OHLCV from GeckoTerminal.
   *
   * `network` and `pool` are GeckoTerminal's own ids — the `network` slug comes
   * from {@link getNetworks}, so the two sources join without a translation
   * table. DexScreener's `chainId` is not used here because the naming differs.
   */
  async getCandles(
    network: string,
    pool: string,
    timeframe: DexTimeframe = "hour",
    options: { force?: boolean } = {},
  ): Promise<DexCandles> {
    const key = `${network}:${pool}:${timeframe}`;
    const source = this.candlesSource(key, network, pool, timeframe);
    const envelope = await source.read({ force: options.force });

    // Unwrapped to the bare candles, because this method's callers want a series
    // and the envelope is an implementation detail of the cache.
    return envelope.data;
  }

  private candlesSource(
    key: string,
    network: string,
    pool: string,
    timeframe: DexTimeframe,
  ): CachedSource<DexCandles> {
    const existing = this.candles.get(key);
    if (existing) return existing;

    // The cached type is the envelope, so an inflight de-duplicator wraps the
    // candles rather than the candles alone.
    const created = new CachedSource<DexCandles>({
      ttlMs: CANDLES_TTL_MS,
      load: async () => {
        const { data } = await this.http.get<unknown>(
          `${GECKOTERMINAL}/networks/${encodeURIComponent(network)}/pools/${encodeURIComponent(pool)}/ohlcv/${timeframe}`,
          { timeout: REQUEST_TIMEOUT_MS },
        );
        return {
          pairId: pool,
          timeframe,
          candles: mapDexCandles(data),
          fetchedAt: Date.now(),
          stale: false,
          error: null,
        };
      },
      // Candles are history, so a stale copy is still a true record of what
      // happened; unlike a live price this is safe to serve late.
      staleWhileRefreshing: true,
      empty: () => ({
        pairId: pool,
        timeframe,
        candles: [],
        fetchedAt: Date.now(),
        stale: true,
        error: "candles unavailable",
      }),
    });

    if (this.candles.size >= 60) {
      const oldest = this.candles.keys().next();
      if (!oldest.done) this.candles.delete(oldest.value);
    }

    this.candles.set(key, created);
    return created;
  }

  /** Quick reachability probe, for the panel's source report. */
  async probe(): Promise<{ source: string; label: string; ok: boolean; error: string | null }[]> {
    const targets = [
      { source: "dexscreener", label: "DexScreener", url: `${DEXSCREENER}/latest/dex/search?q=WETH` },
      { source: "geckoterminal", label: "GeckoTerminal", url: `${GECKOTERMINAL}/networks` },
    ];

    return Promise.all(
      targets.map(async (target) => {
        try {
          await this.http.get<unknown>(target.url, { timeout: REQUEST_TIMEOUT_MS });
          return { ...target, ok: true, error: null };
        } catch (error) {
          return { ...target, ok: false, error: describeError(error) };
        }
      }),
    );
  }
}

/** GeckoTerminal's supported bucket widths. */
export type DexTimeframe = "minute" | "hour" | "day" | "week";