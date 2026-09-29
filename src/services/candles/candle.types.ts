/** Chartable markets. Everything the candle service knows how to source. */
export type CandleSymbol =
  | "BTCUSDT"
  | "ETHUSDT"
  | "SOLUSDT"
  | "XAUTUSD"
  | "USDIRT"
  | "EURIRT"
  | "GOLD18IRT";

export const CANDLE_SYMBOLS: readonly CandleSymbol[] = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XAUTUSD",
  "USDIRT",
  "EURIRT",
  "GOLD18IRT",
];

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export const CANDLE_INTERVALS: readonly CandleInterval[] = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
];

export const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

/**
 * Where a symbol's candles come from.
 *
 * - `coingecko` markets have a real OHLC history endpoint, so the chart is
 *   exact and goes back as far as the range allows.
 * - `nerkh` markets are the Iranian rial rates. No Iranian exchange publishes
 *   an OHLC endpoint, so their candles are aggregated server side from the live
 *   nerkh.io samples the crawler already takes. Genuine prices, but the history
 *   only exists from the moment the server started watching.
 */
export type CandleSource = "coingecko" | "nerkh";

export type CandleSpec = {
  symbol: CandleSymbol;
  /** Dictionary key for the display name. */
  labelKey: string;
  source: CandleSource;
  /** CoinGecko coin id, for `coingecko` symbols. */
  coinId: string | null;
  /** nerkh.io instrument key, for `nerkh` symbols. */
  nerkhKey: string | null;
  /** CoinGecko accepts a maximum `days`; the rial pairs have no history. */
  maxDays: number | null;
  /** Rial per unit, for display when the underlying is quoted in Toman. */
  quoteScale: number;
};

export const CANDLE_SPECS: Record<CandleSymbol, CandleSpec> = {
  BTCUSDT: {
    symbol: "BTCUSDT",
    labelKey: "charts.symbols.btc",
    source: "coingecko",
    coinId: "bitcoin",
    nerkhKey: null,
    maxDays: 180,
    quoteScale: 1,
  },
  ETHUSDT: {
    symbol: "ETHUSDT",
    labelKey: "charts.symbols.eth",
    source: "coingecko",
    coinId: "ethereum",
    nerkhKey: null,
    maxDays: 180,
    quoteScale: 1,
  },
  SOLUSDT: {
    symbol: "SOLUSDT",
    labelKey: "charts.symbols.sol",
    source: "coingecko",
    coinId: "solana",
    nerkhKey: null,
    maxDays: 180,
    quoteScale: 1,
  },
  XAUTUSD: {
    symbol: "XAUTUSD",
    labelKey: "charts.symbols.xaut",
    source: "coingecko",
    // Tether Gold tracks the spot gold price, so it gives a real gold chart
    // even though no Iranian exchange exposes physical gold.
    coinId: "tether-gold",
    nerkhKey: null,
    maxDays: 180,
    quoteScale: 1,
  },
  USDIRT: {
    symbol: "USDIRT",
    labelKey: "charts.symbols.usdirt",
    source: "nerkh",
    coinId: null,
    nerkhKey: "USD",
    maxDays: null,
    quoteScale: 10,
  },
  EURIRT: {
    symbol: "EURIRT",
    labelKey: "charts.symbols.eurirt",
    source: "nerkh",
    coinId: null,
    nerkhKey: "EUR",
    maxDays: null,
    quoteScale: 10,
  },
  GOLD18IRT: {
    symbol: "GOLD18IRT",
    labelKey: "charts.symbols.gold18irt",
    source: "nerkh",
    coinId: null,
    nerkhKey: "GOLD18K",
    maxDays: null,
    quoteScale: 10,
  },
};

export type Candle = {
  /** Bucket open time, epoch ms. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Traded volume, when the upstream reports it. */
  volume: number | null;
};

export type CandleSeries = {
  symbol: CandleSymbol;
  interval: CandleInterval;
  source: CandleSource;
  candles: Candle[];
  /**
   * True when the series is built from live samples rather than a published
   * history, so the chart can say how much of it actually exists.
   */
  aggregated: boolean;
  /** When the server started accumulating this symbol, if aggregated. */
  collectingSince: number | null;
  fetchedAt: number;
  error: string | null;
};
