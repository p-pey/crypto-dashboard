import { injectable } from "tsyringe";

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

type Listener = (tickers: BinanceTicker[]) => void;
export const WebSocketSerivceToken = Symbol('WebSocketService')
@injectable({
       token: WebSocketSerivceToken
})
export default class WebSocketService {
       private _ws: WebSocket | null = null;
       private listeners: Listener[] = [];

       connect(url: string): void {
              this._ws = new WebSocket(url);

              this._ws.onmessage = (event: MessageEvent) => {
                     const tickers: BinanceTicker[] = JSON.parse(event.data);

                     // Filter USDT pairs
                     const usdtPairs = tickers.filter(t => t.s.endsWith("USDT"));

                     // Sort by 24h quote volume
                     const sorted = usdtPairs.sort((a, b) => parseFloat(b.q) - parseFloat(a.q));

                     // Top 100
                     const top100 = sorted.slice(0, 100);

                     // Notify subscribers
                     this.listeners.forEach(cb => cb(top100));
              };
       }
       public get ws() {
              if (!this._ws) throw new Error("Connect First !!")
              return this._ws;
       }

       public subscribe(callback: Listener): void {
              this.listeners.push(callback);
       }

       public unsubscribe(callback: Listener): void {
              this.listeners = this.listeners.filter(cb => cb !== callback);
       }
}


