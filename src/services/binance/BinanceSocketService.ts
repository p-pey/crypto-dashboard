import { AppInject, AppSignleton } from "~/lib/container";
import type WebSocketService from "~/lib/socket";
import { WebSocketServiceToken } from "~/lib/socket";
import type { Coin } from "~/types/types";
import { BinanceSocketServiceMapper } from "./BinanceSocketService.mapper";
import type { Listener } from "./BinanceSocketService.types";
import { CoinsRepository } from "~/repository/coins.repository";


@AppSignleton()
export default class BinanceService {
  private listeners: Listener[] = [];
  constructor(
    @AppInject(WebSocketServiceToken) private _websocket: WebSocketService,
    @AppInject(CoinsRepository) private _coinsRepo: CoinsRepository,
  ) {
    _coinsRepo.setCoins();
  }

  connectToTicker(coins: Coin[], cb: Listener): void {
    const socketUrl = BinanceSocketServiceMapper.mapCoinsSymbolToGetUrlParam(coins)
    const url = `wss://stream.binance.com:9443/stream?streams=${socketUrl}`;
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
