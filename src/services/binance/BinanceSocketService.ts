import { AppInject, AppSignleton } from "~/lib/container";
import type WebSocketService from "~/lib/socket";
import { WebSocketSerivceToken } from "~/lib/socket";
import type { Coin } from "~/types/types";
import { BinanceSocketServiceMapper } from "./BinanceSocketService.mapper";
import type { Listener } from "./BinanceSocketService.types";


@AppSignleton()
export default class BinanceService {
  private listeners: Listener[] = [];
  constructor(
    @AppInject(WebSocketSerivceToken) private _websocket: WebSocketService,
  ) {}

  connectToTicker(coins: Coin[], cb: Listener): void {
    const url = `wss://stream.binance.com:9443/stream?streams=${BinanceSocketServiceMapper.mapCoinsSymbolToGetUrlParam(coins)}`;
    this._websocket.connect(url);
    if (cb) this.subscribe(cb);
    this._websocket.ws.onmessage = (event: MessageEvent) => {
      const ticker = BinanceSocketServiceMapper.mapParseEvent(event);
      BinanceSocketServiceMapper.mapPriceToObject(
        ticker,
        BinanceSocketServiceMapper.mapCoinsToFindOrder(coins, ticker),
      );
      const coinsDataTable = BinanceSocketServiceMapper.mapCoinsToArray();

      // Notify subscribers
      this.listeners.forEach((cb) => cb(coinsDataTable));
    };

    this._websocket.ws.onclose = () => {
      console.log("Binance WebSocket closed. Reconnecting...");
      setTimeout(() => this._websocket.connect(url), 5000);
    };
  }

  subscribe(callback: Listener): void {
    this.listeners.push(callback);
  }

  unsubscribe(callback: Listener): void {
    this.listeners = this.listeners.filter((cb) => cb !== callback);
  }
}
