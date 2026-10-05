import "server-only";

import { CachedSource } from "~/lib/cachedSource";
import { AppInject, AppSignleton } from "~/lib/container";
import { AxiosService } from "~/lib/axios";

import {
  isCryptoMarket,
  mapMarket,
  type PredictionMarket,
  type PredictionSnapshot,
} from "./prediction.mapper";

/**
 * Prediction markets, from Polymarket's public Gamma API.
 *
 * Free, keyless, no account — which is unusual for a source of continuously
 * updated, money-backed odds. That is the whole reason this is here: a probability
 * the market pays for is a different *kind* of information from a funding rate or
 * an RSI, and reading the two together is more informative than either alone.
 *
 * The crypto filter matters more than it looks. Polymarket's top-volume markets
 * are dominated by elections and geopolitics, so an unfiltered list would push
 * every crypto dashboard's prediction panel off-topic within a week.
 */

const GAMMA = "https://gamma-api.polymarket.com";

const REQUEST_TIMEOUT_MS = 12_000;

/**
 * Markets move on news, not on a schedule. Two minutes is a refresh rather than
 * a cache: a probability that is an hour stale is a different claim from the one
 * the market is making now.
 */
const MARKETS_TTL_MS = 2 * 60_000;

/** At or above this, the market is effectively calling the event settled. */
const NEAR_SETTLED = 0.9;

@AppSignleton()
export default class PredictionService {
  private readonly source: CachedSource<PredictionMarket[]>;

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {
    this.source = new CachedSource<PredictionMarket[]>({
      ttlMs: MARKETS_TTL_MS,
      load: async () => {
        const params = new URLSearchParams({
          limit: "200",
          closed: "false",
          active: "true",
          order: "volume24hr",
          ascending: "false",
        });

        const { data } = await this.http.get<unknown>(
          `${GAMMA}/markets?${params.toString()}`,
          { timeout: REQUEST_TIMEOUT_MS },
        );

        if (!Array.isArray(data)) {
          throw new Error("Gamma did not return a market list");
        }

        return data
          .map(mapMarket)
          .filter((market): market is PredictionMarket => market !== null);
      },
      empty: () => [],
    });
  }

  async getSnapshot(options: { force?: boolean } = {}): Promise<PredictionSnapshot> {
    const envelope = await this.source.read({ force: options.force });

    const crypto = envelope.data.filter(isCryptoMarket);

    // Sorted by money committed rather than by probability. Volume is how the
    // market itself ranks attention, and a 99%-certain market on $200 of
    // liquidity is noise while a 60/40 split on $500k is a real read.
    const ranked = [...crypto].sort(
      (a, b) => (b.volumeTotal ?? 0) - (a.volumeTotal ?? 0),
    );

    return {
      markets: ranked.slice(0, 30),
      totals: {
        markets: crypto.length,
        liquidity: crypto.reduce((sum, market) => sum + (market.liquidity ?? 0), 0),
        volume24h: crypto.reduce((sum, market) => sum + (market.volume24h ?? 0), 0),
        nearSettled: crypto.filter(
          (market) => (market.topProbability ?? 0) >= NEAR_SETTLED,
        ).length,
      },
      /** How many of the fetched markets the crypto filter discarded. */
      filteredOut: envelope.data.length - crypto.length,
      fetchedAt: envelope.fetchedAt,
      stale: envelope.stale,
      error: envelope.error,
    };
  }
}