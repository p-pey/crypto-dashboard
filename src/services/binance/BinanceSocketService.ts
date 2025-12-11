import { AppInject, AppSignleton } from "~/lib/container";
import type WebSocketService from "~/lib/socket";
import { WebSocketSerivceToken } from "~/lib/socket";
import type { Coin } from "~/types/types";
import { BinanceSocketServiceMapper } from "./BinanceSocketService.mapper";
import type { Listener } from "./BinanceSocketService.types";


@AppSignleton()
export default class BinanceService {
       private listeners: Listener[] = [];
       constructor(@AppInject(WebSocketSerivceToken) private _websocket: WebSocketService) { }

       connectToTicker(cb: Listener, coins: Coin[]): void {
              this._websocket.connect(`wss://stream.binance.com:9443/stream?streams=${BinanceSocketServiceMapper.mapCoinsSymbolToGetUrlParam(coins)}`);
              if (cb) this.subscribe(cb)
              this._websocket.ws.onmessage = (event: MessageEvent) => {
                     const ticker = BinanceSocketServiceMapper.mapParseEvent(event);
                     BinanceSocketServiceMapper.mapPriceToObject(ticker)
                     const coinsDataTable = BinanceSocketServiceMapper.mapCoinsToArray();

                     // Notify subscribers
                     this.listeners.forEach(cb => cb(coinsDataTable));
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
