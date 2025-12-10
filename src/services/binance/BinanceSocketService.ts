import { AppInject, AppSignleton } from "~/lib/container";
import type WebSocketService from "~/lib/socket";
import { WebSocketSerivceToken } from "~/lib/socket";
import { BinanceSocketServiceMapper } from "./BinanceSocketService.mapper";
import type { Listener } from "./BinanceSocketService.types";


@AppSignleton()
export default class BinanceService {
       private listeners: Listener[] = [];
       constructor(@AppInject(WebSocketSerivceToken) private _websocket: WebSocketService) { }

       connectToTicker(cb?: Listener): void {
              this._websocket.connect("wss://stream.binance.com:9443/ws/!ticker@arr");
              if (cb) this.subscribe(cb)
              this._websocket.ws.onmessage = (event: MessageEvent) => {
                     const tickers = BinanceSocketServiceMapper.mapParseEvent(event);
                     // Filter USDT pairs
                     const usdtPairs = BinanceSocketServiceMapper.mapCoinToGetUSDTPairs(tickers);

                     // Sort by 24h quote volume
                     const sorted = usdtPairs.sort((a, b) => parseFloat(b.q) - parseFloat(a.q));

                     // Top 100
                     const top100 = sorted.slice(0, 100);

                     // Notify subscribers
                     this.listeners.forEach(cb => cb(top100));
              };

              this._websocket.ws.onclose = () => {
                     console.log("Binance WebSocket closed. Reconnecting...");
                     setTimeout(() => this._websocket.connect("wss://stream.binance.com:9443/ws/!ticker@arr"), 5000);
              };
       }

       subscribe(callback: Listener): void {
              this.listeners.push(callback);
       }

       unsubscribe(callback: Listener): void {
              this.listeners = this.listeners.filter(cb => cb !== callback);
       }
}
