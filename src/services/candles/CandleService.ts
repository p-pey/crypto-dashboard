import { AxiosService } from "~/lib/axios";
import { AppInject, AppSignleton } from "~/lib/container";

import { candleStore } from "./CandleStore";
import {
  CANDLE_SPECS,
  type Candle,
  type CandleInterval,
  type CandleSeries,
  type CandleSymbol,
} from "./candle.types";
import NerkhCrawlerService from "~/services/nerkh/NerkhCrawlerService";
import { findQuote, RIAL_PER_TOMAN } from "~/services/nerkh/nerkh.types";

/** Published history is cached per (coin, interval) for this long. */
const HISTORY_TTL_MS = 5 * 60_000;

const CG_TIMEOUT_MS = 12_000;

const BROWSER_HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

type HistoryCache = { candles: Candle[]; expiresAt: number };

/**
 * How often the rial pairs are sampled on their own.
 *
 * Without this the candle store only fills while somebody happens to be looking
 * at the charts, so the Iranian history would be whatever traffic the app
 * happened to get. Sampling on a timer makes the accumulation continuous and
 * independent of visitors, which is the only way the aggregated series ever
 * becomes deep enough to be useful.
 */
const SAMPLER_INTERVAL_MS = 20_000;

/**
 * Serves candlestick series.
 *
 * Two very different sources, deliberately kept behind one shape:
 *
 * - **CoinGecko** markets (crypto and spot gold) have a real OHLC endpoint, so
 *   the series is exact and deep. Binance is geo-blocked from a lot of
 *   networks, and CoinGecko is the one price source in this project that is
 *   reachable regardless of where the server sits.
 * - **nerkh.io** markets (the Iranian rial rates) have no published OHLC
 *   anywhere, so their candles are accumulated from the live samples the price
 *   crawler already takes. The response says `aggregated: true` and reports
 *   `collectingSince`, so the chart can state the real history depth instead of
 *   implying a year of data it does not have.
 */
@AppSignleton()
export default class CandleService {
  private history = new Map<string, HistoryCache>();
  private sampler: ReturnType<typeof setInterval> | null = null;

  constructor(
    @AppInject(AxiosService) private readonly http: AxiosService,
    @AppInject(NerkhCrawlerService) private readonly nerkh: NerkhCrawlerService,
  ) {}

  /**
   * Keeps the rial candle store filling between page views. The interval is
   * `unref`'d so it never holds the process open on its own.
   */
  private ensureSampler(): void {
    if (this.sampler) return;
    this.sampler = setInterval(() => {
      void this.sampleNerkh();
    }, SAMPLER_INTERVAL_MS);
    this.sampler.unref?.();
  }

  private async sampleNerkh(): Promise<void> {
    try {
      const snapshot = await this.nerkh.getSnapshot();
      for (const symbol of Object.keys(CANDLE_SPECS) as CandleSymbol[]) {
        const key = CANDLE_SPECS[symbol].nerkhKey;
        if (!key) continue;
        const quote = findQuote(snapshot, key);
        if (!quote) continue;
        candleStore.record(
          symbol,
          quote.current * RIAL_PER_TOMAN,
          snapshot.fetchedAt,
        );
      }
    } catch {
      // A failed sample just means one fewer observation in the bucket.
    }
  }

  async getSeries(
    symbol: CandleSymbol,
    interval: CandleInterval,
    options: { limit?: number; force?: boolean } = {},
  ): Promise<CandleSeries> {
    const spec = CANDLE_SPECS[symbol];
    const limit = clampLimit(options.limit ?? 300);

    if (spec.source === "nerkh") {
      this.ensureSampler();
      return this.nerkhSeries(symbol, interval, limit);
    }

    const candles = await this.publishedHistory(
      symbol,
      interval,
      options.force,
    );
    return {
      symbol,
      interval,
      source: spec.source,
      candles: candles.slice(-limit),
      aggregated: false,
      collectingSince: null,
      fetchedAt: Date.now(),
      error: null,
    };
  }

  /**
   * Folds the current nerkh snapshot into the accumulator, then reads the
   * requested interval back out. Folding on every read means the chart is never
   * more than one poll behind.
   */
  private async nerkhSeries(
    symbol: CandleSymbol,
    interval: CandleInterval,
    limit: number,
  ): Promise<CandleSeries> {
    const spec = CANDLE_SPECS[symbol];
    if (!spec.nerkhKey) {
      return empty(symbol, interval, "nerkh.io instrument not configured");
    }

    const snapshot = await this.nerkh.getSnapshot();
    const quote = findQuote(snapshot, spec.nerkhKey);

    if (!quote) {
      return {
        ...empty(symbol, interval, "nerkh.io did not return this instrument"),
        error: snapshot.error,
      };
    }

    // Nerkh quotes in Toman; the rial pairs are published in Rial.
    candleStore.record(
      symbol,
      quote.current * RIAL_PER_TOMAN,
      snapshot.fetchedAt,
    );

    return {
      symbol,
      interval,
      source: "nerkh",
      candles: candleStore.read(symbol, interval).slice(-limit),
      aggregated: true,
      collectingSince: candleStore.collectingSince(symbol),
      fetchedAt: snapshot.fetchedAt,
      error: null,
    };
  }

  private async publishedHistory(
    symbol: CandleSymbol,
    interval: CandleInterval,
    force?: boolean,
  ): Promise<Candle[]> {
    const spec = CANDLE_SPECS[symbol];
    if (!spec.coinId || !spec.maxDays) return [];

    const key = `${spec.coinId}:${interval}`;
    const cached = this.history.get(key);
    if (!force && cached && cached.expiresAt > Date.now())
      return cached.candles;

    try {
      const { data } = await this.http.get<unknown>(
        `https://api.coingecko.com/api/v3/coins/${spec.coinId}/ohlc` +
          `?vs_currency=usd&days=${spec.maxDays}`,
        { headers: BROWSER_HEADERS, timeout: CG_TIMEOUT_MS },
      );

      const candles = mapCoinGeckoOhlc(data, interval);
      this.history.set(key, {
        candles,
        expiresAt: Date.now() + HISTORY_TTL_MS,
      });
      // Seeding keeps the accumulator useful if CoinGecko later rate-limits.
      candleStore.seed(symbol, interval, candles);
      return candles;
    } catch (error) {
      // A rate limit must not empty the chart: fall back to whatever is cached.
      const stale = this.history.get(key);
      if (stale) return stale.candles;
      const seeded = candleStore.read(symbol, interval);
      if (seeded.length > 0) return seeded;
      throw new Error(
        error instanceof Error ? error.message : "candle source unavailable",
      );
    }
  }
}

/** CoinGecko returns `[time, open, high, low, close]`, already bucketed. */
function mapCoinGeckoOhlc(
  payload: unknown,
  interval: CandleInterval,
): Candle[] {
  if (!Array.isArray(payload)) return [];
  const width = intervalWidth(interval);

  const out: Candle[] = [];
  for (const row of payload) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [time, open, high, low, close] = row as [
      number,
      number,
      number,
      number,
      number,
    ];
    if (![time, open, high, low, close].every((n) => Number.isFinite(n)))
      continue;

    out.push({
      // CoinGecko's OHLC endpoint is fixed-width; re-bucket to what was asked.
      time: Math.floor(time / width) * width,
      open,
      high,
      low,
      close,
      volume: null,
    });
  }

  // Re-bucketing can collide, so merge by bucket rather than emitting overlaps.
  const merged = new Map<number, Candle>();
  for (const candle of out) {
    const existing = merged.get(candle.time);
    if (!existing) {
      merged.set(candle.time, candle);
      continue;
    }
    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
  }

  return [...merged.values()].sort((a, b) => a.time - b.time);
}

function intervalWidth(interval: CandleInterval): number {
  return {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
  }[interval];
}

function clampLimit(limit: number): number {
  return Math.min(1_000, Math.max(20, Math.floor(limit)));
}

function empty(
  symbol: CandleSymbol,
  interval: CandleInterval,
  error: string | null,
): CandleSeries {
  return {
    symbol,
    interval,
    source: CANDLE_SPECS[symbol].source,
    candles: [],
    aggregated: CANDLE_SPECS[symbol].source === "nerkh",
    collectingSince: candleStore.collectingSince(symbol),
    fetchedAt: Date.now(),
    error,
  };
}
