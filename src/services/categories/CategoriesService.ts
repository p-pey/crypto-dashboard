import "server-only";

import { toNumber } from "~/lib/cachedSource";
import { AppInject, AppSignleton } from "~/lib/container";
import { AxiosService } from "~/lib/axios";
import { CachedSource } from "~/lib/cachedSource";

/**
 * Sector rotation, from CoinGecko's public category endpoint.
 *
 * This exists because a per-coin table cannot answer a sector question. Whether
 * capital is rotating out of layer 1s into memes, or into DeFi, or out of crypto
 * entirely, is a question about **relative** performance across a group — and a
 * list of coins ranked by their own change simply does not contain that answer.
 *
 * `docs/market-data.md` recorded CoinMarketCap Pro as the only source for
 * categories, which is what made that paid key look load-bearing. `/coins/
 * categories` is free and keyless, so the paid adapter stays optional and the
 * rotation board works with no credential at all.
 */

const CATEGORIES_URL = "https://api.coingecko.com/api/v3/coins/categories";

/**
 * CoinGecko's public tier allows a few calls a minute, and the app already
 * spends some of that on the top-100 list and the global figures. Five minutes
 * is comfortably inside the budget and category membership changes in days, not
 * minutes.
 */
const CATEGORIES_TTL_MS = 5 * 60_000;

export type CategoryRow = {
  id: string;
  name: string;
  /** Aggregate market cap of every coin in the category, USD. */
  marketCap: number | null;
  /** 24h change of that aggregate, in percent. This is the rotation signal. */
  change24h: number | null;
  volume24h: number | null;
  /** Count of coins listed, which says how broad the category is. */
  coinCount: number;
  /** CoinGecko's own one-line description, for the row tooltip. */
  description: string | null;
};

export type CategorySnapshot = {
  categories: CategoryRow[];
  /** Share of total tracked market cap, 0..1, for the share meter. */
  totalMarketCap: number | null;
  /** Categories whose aggregate grew, over those that shrank. */
  advancing: number;
  declining: number;
  fetchedAt: number;
  stale: boolean;
  error: string | null;
};

@AppSignleton()
export default class CategoriesService {
  private readonly source: CachedSource<CategoryRow[]>;

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {
    this.source = new CachedSource<CategoryRow[]>({
      ttlMs: CATEGORIES_TTL_MS,
      load: async () => {
        const { data } = await this.http.get<unknown>(CATEGORIES_URL);
        return mapCategories(data);
      },
      empty: () => [],
    });
  }

  async getSnapshot(
    options: { limit?: number; force?: boolean } = {},
  ): Promise<CategorySnapshot> {
    const envelope = await this.source.read({ force: options.force });

    const rows = envelope.data
      .filter((row) => (row.marketCap ?? 0) > 0)
      // Ranked by change, not by size: a rotation board is about which sectors
      // are gaining, and ranking by cap would bury a small fast-rising category
      // under a large slow one every time.
      .sort((a, b) => (b.change24h ?? -Infinity) - (a.change24h ?? -Infinity));

    const totalMarketCap = rows.reduce(
      (sum, row) => sum + (row.marketCap ?? 0),
      0,
    );

    return {
      categories: rows.slice(0, options.limit ?? 40),
      totalMarketCap: totalMarketCap > 0 ? totalMarketCap : null,
      advancing: rows.filter((row) => (row.change24h ?? 0) > 0).length,
      declining: rows.filter((row) => (row.change24h ?? 0) < 0).length,
      fetchedAt: envelope.fetchedAt,
      stale: envelope.stale,
      error: envelope.error,
    };
  }

  /** One category by id, for a detail view. */
  async getCategory(id: string): Promise<CategoryRow | null> {
    const envelope = await this.source.read();
    return envelope.data.find((row) => row.id === id) ?? null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapCategories(payload: unknown): CategoryRow[] {
  if (!Array.isArray(payload)) return [];

  return payload
    .map((value): CategoryRow | null => {
      const row = asRecord(value);
      const id = typeof row.id === "string" ? row.id : null;
      const name = typeof row.name === "string" ? row.name : null;
      // CoinGecko keeps retired and empty categories in the response; a category
      // with no coins and no cap is not a sector anyone can hold.
      if (!id || !name) return null;

      return {
        id,
        name,
        marketCap: toNumber(row.market_cap),
        change24h: toNumber(row.market_cap_change_24h),
        volume24h: toNumber(row.volume_24h),
        coinCount: Array.isArray(row.coins) ? row.coins.length : 0,
        description: typeof row.content === "string" ? row.content : null,
      };
    })
    .filter((row): row is CategoryRow => row !== null);
}