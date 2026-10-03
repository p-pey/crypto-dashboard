import "server-only";

import { env } from "~/env.js";
import { AxiosService } from "~/lib/axios";
import { AppInject, AppSignleton } from "~/lib/container";

/**
 * Whole-market figures, which the app had no source for at all.
 *
 * Everything here is free and keyless. CoinMarketCap would also supply it, but
 * their API is a paid Pro tier — see {@link CoinMarketCapService} for the
 * optional adapter that activates when a key exists.
 *
 * Two upstream calls, both cheap:
 *
 * - CoinGecko `/global` for total capitalisation, 24h volume and BTC/ETH
 *   dominance. This is the single most useful thing the app was missing: without
 *   it there is no way to tell whether a coin's move was its own news or the
 *   whole market moving.
 * - alternative.me for the Fear & Greed index. The app already fetched this for
 *   one coin's status panel, but only the latest reading and only per-coin, so
 *   there was no standalone view of it.
 *
 * Both degrade independently: a failure in one leaves the other readable.
 */

export type GlobalMetrics = {
  /** Total crypto market capitalisation in USD. */
  marketCap: number | null;
  /** Total 24h trading volume in USD. */
  volume24h: number | null;
  /** Percentage change in total cap over 24h. */
  marketCapChange24h: number | null;
  /** Market cap as a share of total, 0..1. */
  dominance: { btc: number | null; eth: number | null } | null;
  /** Coins currently listed. */
  activeCryptocurrencies: number | null;
  generatedAt: number;
  error: string | null;
};

export type FearAndGreed = {
  /** 0 (extreme fear) .. 100 (extreme greed). */
  value: number | null;
  /** Upstream's own bucket, e.g. "Extreme Fear". Translated for display. */
  classification: string | null;
  /** One reading per day, oldest first, for the trend chart. */
  history: { timestamp: number; value: number }[];
  generatedAt: number;
  error: string | null;
};

const GLOBAL_TTL_MS = 120_000;
const FNG_TTL_MS = 600_000;

type Cache<T> = { value: T; expiresAt: number } | null;

@AppSignleton()
export default class MarketStatsService {
  private globalCache: Cache<GlobalMetrics> = null;
  private fngCache: Cache<FearAndGreed> = null;
  private globalInFlight: Promise<GlobalMetrics> | null = null;
  private fngInFlight: Promise<FearAndGreed> | null = null;

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {}

  async getGlobal(options: { force?: boolean } = {}): Promise<GlobalMetrics> {
    if (
      !options.force &&
      this.globalCache &&
      this.globalCache.expiresAt > Date.now()
    ) {
      return this.globalCache.value;
    }
    if (this.globalInFlight) return this.globalInFlight;

    this.globalInFlight = this.fetchGlobal().finally(() => {
      this.globalInFlight = null;
    });
    return this.globalInFlight;
  }

  private async fetchGlobal(): Promise<GlobalMetrics> {
    const empty: GlobalMetrics = {
      marketCap: null,
      volume24h: null,
      marketCapChange24h: null,
      dominance: null,
      activeCryptocurrencies: null,
      generatedAt: Date.now(),
      error: "could not reach CoinGecko's global endpoint",
    };

    try {
      const { data } = await this.http.get<{ data?: Record<string, unknown> }>(
        "https://api.coingecko.com/api/v3/global",
        { headers: { Accept: "application/json" }, timeout: 10_000 },
      );

      const raw = data?.data;
      if (!raw) return empty;

      const totalMarketCap = numberAt(raw, ["total_market_cap", "usd"]);
      const totalVolume = numberAt(raw, ["total_volume", "usd"]);
      const change = numberAt(raw, ["market_cap_change_percentage_24h_usd"]);

      const value: GlobalMetrics = {
        marketCap: totalMarketCap,
        volume24h: totalVolume,
        // CoinGecko returns percent for this one, not a ratio.
        marketCapChange24h: change,
        dominance: {
          btc: ratioAt(raw, ["market_cap_percentage", "btc"]),
          eth: ratioAt(raw, ["market_cap_percentage", "eth"]),
        },
        activeCryptocurrencies:
          numberAt(raw, ["active_cryptocurrencies"]) ?? null,
        generatedAt: Date.now(),
        error: null,
      };

      this.globalCache = { value, expiresAt: Date.now() + GLOBAL_TTL_MS };
      return value;
    } catch (error) {
      // A stale figure beats no figure: the total market cap does not change
      // meaningfully in five minutes, so the last good read is still honest.
      if (this.globalCache) {
        return {
          ...this.globalCache.value,
          generatedAt: Date.now(),
          error: `showing the last good read — ${describe(error)}`,
        };
      }
      return { ...empty, error: `${empty.error} (${describe(error)})` };
    }
  }

  async getFearAndGreed(
    options: { force?: boolean } = {},
  ): Promise<FearAndGreed> {
    if (
      !options.force &&
      this.fngCache &&
      this.fngCache.expiresAt > Date.now()
    ) {
      return this.fngCache.value;
    }
    if (this.fngInFlight) return this.fngInFlight;

    this.fngInFlight = this.fetchFearAndGreed().finally(() => {
      this.fngInFlight = null;
    });
    return this.fngInFlight;
  }

  private async fetchFearAndGreed(): Promise<FearAndGreed> {
    try {
      const { data } = await this.http.get<{
        data?: {
          value?: string;
          value_classification?: string;
          timestamp?: string;
        }[];
      }>("https://api.alternative.me/fng/?limit=90&format=json", {
        headers: { Accept: "application/json" },
        timeout: 10_000,
      });

      const rows = data?.data ?? [];
      const latest = rows[0];

      const value: FearAndGreed = {
        value: toNumber(latest?.value),
        classification: latest?.value_classification ?? null,
        history: rows
          .map((row) => ({
            timestamp: toNumber(row.timestamp) ?? 0,
            value: toNumber(row.value) ?? 0,
          }))
          .filter((row) => row.timestamp > 0)
          .reverse(),
        generatedAt: Date.now(),
        error: null,
      };

      this.fngCache = { value, expiresAt: Date.now() + FNG_TTL_MS };
      return value;
    } catch (error) {
      if (this.fngCache) {
        return { ...this.fngCache.value, error: describe(error) };
      }
      return {
        value: null,
        classification: null,
        history: [],
        generatedAt: Date.now(),
        error: describe(error),
      };
    }
  }

  /** Both panels at once, since they are always shown together. */
  async getAll(
    options: { force?: boolean } = {},
  ): Promise<{ global: GlobalMetrics; fearAndGreed: FearAndGreed }> {
    const [global, fearAndGreed] = await Promise.all([
      this.getGlobal({ force: options.force }),
      this.getFearAndGreed({ force: options.force }),
    ]);
    return { global, fearAndGreed };
  }
}

/** CMC is optional. See {@link CoinMarketCapService} for what a key unlocks. */
export function coinMarketCapConfigured(): boolean {
  return Boolean((env.COINMARKETCAP_API_KEY ?? "").trim());
}

/** Reads `a.b.c` out of a nested plain object, as a number or null. */
function numberAt(
  source: Record<string, unknown>,
  path: string[],
): number | null {
  return toNumber(readPath(source, path));
}

/** Same, but a percentage that upstream reports as 0..100 and we keep as 0..1. */
function ratioAt(
  source: Record<string, unknown>,
  path: string[],
): number | null {
  const value = toNumber(readPath(source, path));
  return value === null ? null : value / 100;
}

function readPath(source: Record<string, unknown>, path: string[]): unknown {
  let node: unknown = source;
  for (const segment of path) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function describe(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const status = (error as { response?: { status?: unknown } }).response
      ?.status;
    if (typeof status === "number") return `upstream returned HTTP ${status}`;
  }
  if (error instanceof Error) return error.message;
  return "the request failed";
}
