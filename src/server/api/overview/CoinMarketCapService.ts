import "server-only";

import { env } from "~/env.js";
import { AxiosService } from "~/lib/axios";
import { AppInject, AppSignleton } from "~/lib/container";

/**
 * CoinMarketCap, as an optional adapter.
 *
 * **Nothing here runs until you have a Pro key**, and the app is complete
 * without one — every figure CMC would supply that the app uses is already
 * sourced free from CoinGecko. What a key adds is the parts CMC has that nobody
 * else publishes cheaply: exchange rankings, derivatives (funding rates and open
 * interest), category indices and the altcoin season index.
 *
 * CMC's API is a **paid Pro tier**. This is written against their documented v1
 * REST shape so that adding a key is a configuration change rather than a code
 * change, but it is deliberately untested against the live service here, because
 * no key was available. It reports `configured: false` and is skipped entirely
 * until one exists — so a wrong guess about an endpoint cannot break the app.
 *
 * To enable it: buy the tier, then set the key and restart.
 * `https://pro-api.coinmarketcap.com` is the base; the key travels in the
 * `X-CMC_PRO_API_KEY` header rather than the query string, so it stays out of
 * access logs.
 */

export type CmcStatus = {
  configured: boolean;
  /** Whether a key is present. Deliberately says nothing about its value. */
  reason: string | null;
};

export type CmcCategories = {
  id: string;
  name: string;
  marketCap: number | null;
  volume24h: number | null;
  /** Share of the whole market, 0..1. */
  share: number | null;
  marketCapChange24h: number | null;
}[];

export type CmcExchanges = {
  rank: number;
  name: string;
  pairCount: number | null;
  volume24h: number | null;
  /** Share of total reported exchange volume, 0..1. */
  volumeShare: number | null;
  country: string | null;
}[];

export type CmcDerivatives = {
  symbol: string;
  name: string;
  openInterest: number | null;
  openInterestUsd: number | null;
  fundingRate: number | null;
  volume24hUsd: number | null;
}[];

const BASE_URL = "https://pro-api.coinmarketcap.com";
const TTL_MS = 300_000;

@AppSignleton()
export default class CoinMarketCapService {
  private readonly key: string | null =
    (env.COINMARKETCAP_API_KEY ?? "").trim() || null;

  private categoriesCache: { value: CmcCategories; expiresAt: number } | null =
    null;
  private exchangesCache: { value: CmcExchanges; expiresAt: number } | null =
    null;

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {}

  get configured(): boolean {
    return this.key !== null;
  }

  status(): CmcStatus {
    return {
      configured: this.configured,
      reason: this.configured
        ? null
        : "no COINMARKETCAP_API_KEY set — free sources are being used instead",
    };
  }

  /**
   * Market categories, e.g. Layer 1, DeFi, Meme.
   *
   * Each carries its own market cap and 24h change, which is what makes this
   * worth a key: it is the nearest free equivalent to a rotation dashboard, and
   * it is the one thing the free sources genuinely do not have.
   */
  async categories(): Promise<CmcCategories | null> {
    if (!this.key) return null;
    if (this.categoriesCache && this.categoriesCache.expiresAt > Date.now()) {
      return this.categoriesCache.value;
    }

    try {
      const { data } = await this.get<{
        data?: {
          id?: number;
          name?: string;
          market_cap?: number;
          volume_24h?: number;
          market_cap_change_24h?: number;
        }[];
      }>("cryptocurrency/categories", {
        limit: 20,
        sort: "market_cap",
        // "cmc_rank" gives the ordering; "market_cap" is the sort key.
        sort_by: "market_cap",
      });

      const rows = data?.data ?? [];
      const total = rows.reduce((sum, row) => sum + (row.market_cap ?? 0), 0);

      const value: CmcCategories = rows.map((row, index) => ({
        id: String(row.id ?? index),
        name: row.name ?? "—",
        marketCap: row.market_cap ?? null,
        volume24h: row.volume_24h ?? null,
        marketCapChange24h: row.market_cap_change_24h ?? null,
        share:
          total > 0 && row.market_cap !== undefined
            ? row.market_cap / total
            : null,
      }));

      this.categoriesCache = { value, expiresAt: Date.now() + TTL_MS };
      return value;
    } catch {
      return null;
    }
  }

  /** Exchange rankings by reported 24h volume. */
  async exchanges(): Promise<CmcExchanges | null> {
    if (!this.key) return null;
    if (this.exchangesCache && this.exchangesCache.expiresAt > Date.now()) {
      return this.exchangesCache.value;
    }

    try {
      const { data } = await this.get<{
        data?: {
          id?: number;
          name?: string;
          pairs?: number;
          volume_24h?: number;
          country?: string;
        }[];
      }>("exchanges/list", { limit: 15, sort_by: "volume_24h" });

      const rows = data?.data ?? [];
      const total = rows.reduce((sum, row) => sum + (row.volume_24h ?? 0), 0);

      const value: CmcExchanges = rows.map((row, index) => ({
        rank: index + 1,
        name: row.name ?? "—",
        pairCount: row.pairs ?? null,
        volume24h: row.volume_24h ?? null,
        volumeShare:
          total > 0 && row.volume_24h !== undefined
            ? row.volume_24h / total
            : null,
        country: row.country ?? null,
      }));

      this.exchangesCache = { value, expiresAt: Date.now() + TTL_MS };
      return value;
    } catch {
      return null;
    }
  }

  /** Derivatives: open interest and funding, which nobody publishes for free. */
  async derivatives(): Promise<CmcDerivatives | null> {
    if (!this.key) return null;

    try {
      const { data } = await this.get<{
        data?: {
          symbol?: string;
          name?: string;
          open_interest?: number;
          open_interest_usd?: number;
          funding_rate?: number;
          volume_24h_usd?: number;
        }[];
      }>("derivatives/latest", {
        sort: "open_interest_usd",
        sort_dir: "desc",
        limit: 20,
      });

      return (data?.data ?? []).map((row, index) => ({
        symbol: row.symbol ?? String(index),
        name: row.name ?? row.symbol ?? "—",
        openInterest: row.open_interest ?? null,
        openInterestUsd: row.open_interest_usd ?? null,
        fundingRate: row.funding_rate ?? null,
        volume24hUsd: row.volume_24h_usd ?? null,
      }));
    } catch {
      return null;
    }
  }

  private async get<T>(
    path: string,
    params: Record<string, string | number>,
  ): Promise<{ data: T }> {
    const search = new URLSearchParams(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    ).toString();

    return this.http.get<T>(
      `${BASE_URL}/v1/${path}${search ? `?${search}` : ""}`,
      {
        timeout: 10_000,
        headers: {
          Accept: "application/json",
          // The key goes in a header so it does not end up in a proxy's access
          // log or a crash report's URL field.
          "X-CMC_PRO_API_KEY": this.key ?? "",
          "X-CMC_PRO_API_KEY_NAME": "",
        },
      },
    );
  }
}
