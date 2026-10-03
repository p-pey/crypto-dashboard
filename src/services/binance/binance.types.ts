/**
 * Binance's `24hrTicker` payload.
 *
 * Every field the combined stream sends is declared here even though the table
 * uses a subset, because the type is the only record of what the venue actually
 * offers. The ones that earned their place in the row model are `c` (last
 * price), `p`/`P` (change), `b`/`a` (book) and `n` (trade count); the rest are
 * documented by the venue and cost nothing to keep.
 */
export type BinanceTicker = {
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
};
