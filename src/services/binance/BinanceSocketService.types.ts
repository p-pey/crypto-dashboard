
// binanceService.ts
export interface BinanceTicker {
       e: string;   // Event type
       E: number;   // Event time
       s: string;   // Symbol, e.g. BTCUSDT
       p: string;   // Price change
       P: string;   // Price change percent
       w: string;   // Weighted avg price
       x: string;   // First trade price
       c: string;   // Last price
       Q: string;   // Last qty
       b: string;   // Best bid price
       B: string;   // Best bid qty
       a: string;   // Best ask price
       A: string;   // Best ask qty
       o: string;   // Open price
       h: string;   // High price
       l: string;   // Low price
       v: string;   // Base asset volume
       q: string;   // Quote asset volume (USDT)
       O: number;   // Open time
       C: number;   // Close time
       F: number;   // First trade ID
       L: number;   // Last trade ID
       n: number;   // Number of trades
}
export type PriceChange = {
       key: string,
       order: number,
       symbol: string,
       price: string,
       change: string,
       changeUsd: string
}
export type Listener = (tickers: PriceChange[]) => void;