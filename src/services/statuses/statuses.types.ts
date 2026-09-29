export type StatusVerdict =
  "strong_buy" | "buy" | "neutral" | "reduce" | "avoid";

export type StatusSignalKey =
  | "trend"
  | "momentum"
  | "rsi"
  | "macd"
  | "volatility"
  | "volume"
  | "community"
  | "news"
  | "market_fear"
  | "ath_distance";

/**
 * One input to the verdict. `score` is -100 (strongly bearish) .. +100
 * (strongly bullish). `available` is false when the upstream source could not
 * be reached, in which case the signal is excluded from the weighted average
 * rather than counted as neutral.
 */
export type StatusSignal = {
  key: StatusSignalKey;
  label: string;
  score: number;
  weight: number;
  detail: string;
  available: boolean;
};

export type StatusNewsItem = {
  title: string;
  source: string;
  link: string;
  publishedAt: number;
  sentiment: number;
};

export type StatusTechnicals = {
  symbol: string;
  price: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  atrPct: number | null;
  change24h: number | null;
  change7d: number | null;
  candles: number;
};

export type StatusMarketSnapshot = {
  marketCapRank: number | null;
  watchlistUsers: number | null;
  votesUpPercent: number | null;
  athChangePercent: number | null;
  currentPrice: number | null;
  totalVolume: number | null;
  priceChangePercent24h: number | null;
  categories: string[];
  fearAndGreed: number | null;
  fearAndGreedLabel: string | null;
};

export type CoinStatus = {
  coinId: string;
  symbol: string;
  name: string;
  image: string | null;
  verdict: StatusVerdict;
  /** -100 .. +100, the weighted composite of every available signal. */
  score: number;
  summary: string;
  generatedBy: "llm" | "deterministic";
  llmProvider: string | null;
  llmModel: string | null;
  /** Populated when the LLM step failed and the deterministic summary was used. */
  llmError: string | null;
  signals: StatusSignal[];
  technicals: StatusTechnicals | null;
  market: StatusMarketSnapshot | null;
  news: StatusNewsItem[];
  /** Sources that could not be reached during this run. */
  unavailableSources: string[];
  generatedAt: number;
  expiresAt: number;
};

export type StatusAnalyzeInput = {
  coinId: string;
  symbol: string;
  name?: string;
  image?: string | null;
  force?: boolean;
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
