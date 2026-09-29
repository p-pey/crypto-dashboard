import {
  CANDLE_SPECS,
  INTERVAL_MS,
  type Candle,
  type CandleInterval,
  type CandleSymbol,
} from "./candle.types";

/** How much history each interval keeps, in buckets. */
const BUCKET_LIMIT: Record<CandleInterval, number> = {
  "1m": 1_440,
  "5m": 2_880,
  "15m": 2_880,
  "1h": 2_000,
  "4h": 1_500,
  "1d": 1_000,
};

/** Below this, two samples are the same trade and would invent candles. */
const MIN_PRICE_MOVE = 1e-9;

/**
 * Rolling OHLC accumulator for the markets that have no published history.
 *
 * The nerkh.io crawler already samples the Iranian rates every few seconds, so
 * this folds each observation into the bucket it belongs to. It is a real
 * aggregation of real ticks rather than an interpolation, but it can only
 * describe the period since the process started: `collectingSince` is reported
 * to the chart so the history depth is never overstated.
 */
export class CandleStore {
  private readonly series = new Map<string, Candle[]>();
  private readonly startedAt = new Map<CandleSymbol, number>();

  /** Folds one observation into every interval bucket for this symbol. */
  record(symbol: CandleSymbol, price: number, at = Date.now()): void {
    if (!Number.isFinite(price) || price <= 0) return;

    if (!this.startedAt.has(symbol)) this.startedAt.set(symbol, at);

    for (const interval of Object.keys(INTERVAL_MS) as CandleInterval[]) {
      const width = INTERVAL_MS[interval];
      const bucketTime = Math.floor(at / width) * width;
      const key = `${symbol}:${interval}`;
      const buckets = this.series.get(key) ?? [];

      const last = buckets.at(-1);
      if (last?.time === bucketTime) {
        // Same bucket: extend the wick and close.
        if (price > last.high) last.high = price;
        if (price < last.low) last.low = price;
        last.close = price;
        continue;
      }
      if (last && last.time > bucketTime) continue; // out-of-order sample

      buckets.push({
        time: bucketTime,
        open: last?.close ?? price,
        high: price,
        low: price,
        close: price,
        volume: null,
      });

      const limit = BUCKET_LIMIT[interval];
      if (buckets.length > limit) buckets.splice(0, buckets.length - limit);
      this.series.set(key, buckets);
    }
  }

  read(symbol: CandleSymbol, interval: CandleInterval): Candle[] {
    const buckets = this.series.get(`${symbol}:${interval}`) ?? [];
    // Copied so a caller mutating the result cannot corrupt the accumulator.
    return buckets.map((candle) => ({ ...candle }));
  }

  collectingSince(symbol: CandleSymbol): number | null {
    return this.startedAt.get(symbol) ?? null;
  }

  /** Seeds history from a published series, e.g. CoinGecko, so a symbol is
   *  usable immediately instead of only after the first interval elapses. */
  seed(
    symbol: CandleSymbol,
    interval: CandleInterval,
    candles: Candle[],
  ): void {
    if (candles.length === 0) return;
    const key = `${symbol}:${interval}`;
    const existing = this.series.get(key) ?? [];
    const merged = new Map<number, Candle>();
    for (const candle of existing) merged.set(candle.time, candle);
    for (const candle of candles) {
      if (!merged.has(candle.time)) merged.set(candle.time, candle);
    }
    const sorted = [...merged.values()].sort((a, b) => a.time - b.time);
    const limit = BUCKET_LIMIT[interval];
    this.series.set(key, sorted.slice(-limit));
  }

  clear(): void {
    this.series.clear();
    this.startedAt.clear();
  }
}

/**
 * A singleton, so the accumulation survives across requests the way the price
 * crawlers do. Resetting it loses the Iranian charts' history.
 */
export const candleStore = new CandleStore();

export const isAggregated = (symbol: CandleSymbol) =>
  CANDLE_SPECS[symbol].source === "nerkh";

export { MIN_PRICE_MOVE };
