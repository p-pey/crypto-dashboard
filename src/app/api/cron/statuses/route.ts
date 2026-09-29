import { NextResponse } from "next/server";
import { AxiosService } from "~/lib/axios";
import { AppContainer } from "~/lib/container";
import { StatusesRepository } from "~/repository/statuses.repository";
import { StatusAnalyzerService } from "~/services/statuses/StatusAnalyzerService";
import type { Coin } from "~/types/types";

const ApiService = AppContainer.resolve(AxiosService);
const Analyzer = AppContainer.resolve(StatusAnalyzerService);
const Repo = AppContainer.resolve(StatusesRepository);

/**
 * Daily "robot" entry point.
 *
 * Call this from system cron / GitHub Actions / any scheduler, e.g.
 *   0 8 * * * curl -sS -X POST http://localhost:3000/api/cron/statuses \
 *     -H 'x-cron-secret: $CRON_SECRET'
 *
 * With no body it pre-warms the top `limit` coins by market cap. Send a JSON
 * body of `{ "coins": [{ "coinId", "symbol", "name" }], "limit": 25 }` to
 * control exactly which coins are analysed.
 *
 * Note the cache is in-memory, so pre-warming only pays off on a long-lived
 * single process. On a serverless deployment this endpoint effectively
 * recomputes and discards.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  let coins: {
    coinId: string;
    symbol: string;
    name?: string;
    image?: string;
  }[] = [];
  let limit = 25;
  let refreshExisting = true;

  try {
    const raw = await request.text();
    if (raw.trim() !== "") {
      const body = JSON.parse(raw) as {
        coins?: {
          coinId: string;
          symbol: string;
          name?: string;
          image?: string;
        }[];
        limit?: number;
        refreshExisting?: boolean;
      };
      coins = body.coins ?? [];
      limit = body.limit ?? limit;
      refreshExisting = body.refreshExisting ?? refreshExisting;
    }
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (coins.length === 0) {
    coins = await topCoins(limit);
  }

  // Keep the sequential fan-out bounded so upstream APIs are not hammered.
  const results: {
    coinId: string;
    ok: boolean;
    verdict?: string;
    error?: string;
  }[] = [];

  for (const coin of coins) {
    try {
      const status = await Analyzer.analyze({
        ...coin,
        force: refreshExisting,
      });
      results.push({
        coinId: status.coinId,
        ok: true,
        verdict: status.verdict,
      });
    } catch (error) {
      results.push({
        coinId: coin.coinId,
        ok: false,
        error: error instanceof Error ? error.message : "analysis failed",
      });
    }
  }

  return NextResponse.json({
    requested: results.length,
    succeeded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    cacheSize: Repo.size,
    durationMs: Date.now() - started,
    results,
  });
}

/** Allow `curl /api/cron/statuses` as a convenience for a first run. */
export async function GET(request: Request) {
  return POST(request);
}

async function topCoins(limit: number) {
  try {
    const { data } = await ApiService.get<Coin[]>(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1`,
      { timeout: 10000 },
    );

    return data.map((coin) => ({
      coinId: coin.id,
      symbol: String(coin.symbol).toUpperCase(),
      name: coin.name,
      image: coin.image,
    }));
  } catch {
    return [];
  }
}
