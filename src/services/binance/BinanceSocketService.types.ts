import type { StatusVerdict } from "~/services/statuses/statuses.types";

// binanceService.ts
export interface BinanceTicker {
  e: string; // Event type
  E: number; // Event time
  s: string; // Symbol, e.g. BTCUSDT
  p: string; // Price change
  P: string; // Price change percent
  w: string; // Weighted avg price
  x: string; // First trade price
  c: string; // Last price
  Q: string; // Last qty
  b: string; // Best bid price
  B: string; // Best bid qty
  a: string; // Best ask price
  A: string; // Best ask qty
  o: string; // Open price
  h: string; // High price
  l: string; // Low price
  v: string; // Base asset volume
  q: string; // Quote asset volume (USDT)
  O: number; // Open time
  C: number; // Close time
  F: number; // First trade ID
  L: number; // Last trade ID
  n: number; // Number of trades
}
export type PriceChange = {
  key: string;
  order: number;
  symbol: string;
  /** CoinGecko id, needed to resolve per-coin status data. */
  id?: string;
  name?: string;
  price: string;
  change: string;
  changeUsd: string;
  divideToBTC: string;
  image: string;
  /** UI-only fields, attached by the coins table. */
  /** Rolling price history backing the trend sparkline. */
  spark?: number[];
  expandStatus?: boolean;
  onToggleExpand?: (key: string) => void;
  statusVerdict?: StatusVerdict;
  statusScore?: number;
};
export type Listener = (tickers: PriceChange[]) => void;
