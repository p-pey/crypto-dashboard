import type { Coin } from "~/types/types";
import type { BinanceTicker, PriceChange } from "./BinanceSocketService.types";



export class BinanceSocketServiceMapper {
       static coins: Record<string, PriceChange> = { ["BTCUSDT"]: { order: 1, change: "0", changeUsd: "0", key: "BTCUDT", price: "0", symbol: "BTC" } }
       static mapCoinsToFindOrder(calledCoins: Coin[], target: BinanceTicker) {
              return calledCoins.find(item => `${item.symbol.toUpperCase()}USDT` === target.s)?.order ?? 0
       }

       static mapPriceToObject(price: BinanceTicker, order: number) {
              this.coins[price.s] = {
                     key: price.s,
                     order,
                     symbol: price.s.replace("USDT", ""),
                     price: parseFloat(price.c).toFixed(4),
                     change: parseFloat(price.P).toFixed(2) + "%",
                     changeUsd: parseFloat(price.p).toFixed(2)
              } as any
       }
       static mapCoinsToArray() {
              return Object.entries(this.coins).map(([key, value]) => {
                     return value
              }).sort((a, b) => a.order - b.order)
       }
       static mapParseEvent(event: MessageEvent): BinanceTicker {
              return JSON.parse(event.data).data;
       }
       static mapCoinsSymbolToGetUrlParam(coins: Coin[]) {
              return coins.map(coin => coin.symbol.toLowerCase()).join("usdt@ticker/")
       }
}