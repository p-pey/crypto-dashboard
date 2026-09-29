/**
 * Rolling price history used to draw the coins table sparkline.
 *
 * Seeded from CoinGecko's 7 day sparkline so the trend is visible immediately,
 * then fed live ticks from the Binance websocket so it keeps moving. Keeps a
 * stable array reference for unchanged symbols so the memoised `Sparkline`
 * does not re-render every row on every tick.
 */

export const COIN_SPARK_LIMIT = 90;

type Entry = {
  values: number[];
  view: number[];
};

function tail(values: number[], limit: number): number[] {
  return values.length > limit ? values.slice(-limit) : values;
}

export class PriceHistoryStore {
  private readonly entries = new Map<string, Entry>();
  private readonly limit: number;

  constructor(limit: number = COIN_SPARK_LIMIT) {
    this.limit = limit;
  }

  /** Replaces a symbol's history, used once when the coin list first arrives. */
  seed(symbol: string, points: number[] | undefined): void {
    const clean = (points ?? []).filter(
      (value) => typeof value === "number" && Number.isFinite(value),
    );
    if (clean.length < 2) return;
    if (this.entries.has(symbol)) return;

    const values = tail(clean, this.limit);
    this.entries.set(symbol, { values, view: values });
  }

  push(symbol: string, value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;

    const entry = this.entries.get(symbol);
    if (!entry) {
      const values = [value];
      this.entries.set(symbol, { values, view: values });
      return;
    }

    // A repeated price is not a new data point, and adding duplicates would
    // flatten the line for thinly traded pairs.
    if (entry.values[entry.values.length - 1] === value) return;

    entry.values = [...entry.values, value];
    if (entry.values.length > this.limit) {
      entry.values = entry.values.slice(-this.limit);
    }
    entry.view = entry.values;
  }

  view(symbol: string): number[] {
    return this.entries.get(symbol)?.view ?? [];
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
