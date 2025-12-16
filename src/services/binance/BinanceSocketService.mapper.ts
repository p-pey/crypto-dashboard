import type { Coin } from "~/types/types";
import type { BinanceTicker, PriceChange } from "./BinanceSocketService.types";


export class BinanceSocketServiceMapper {
  static BTCPrice: PriceChange['price'];
  static coins: Map<string, PriceChange> = new Map();
  static mapCoinsToFindOrder(calledCoins: Coin[], target: BinanceTicker) {
    return calledCoins.find(
      (item) => `${item.symbol.toUpperCase()}USDT` === target.s,
    ) as Coin;
  }

  static mapPriceToObject(price: BinanceTicker, targetCoin:  Coin ) {
    if(price.s === "BTCUSDT") {
      this.BTCPrice = parseFloat(price.c).toFixed(4);
    }
    this.coins.set(price.s, {
      key: price.s,
      order: targetCoin.order,
      image: targetCoin.image,
      symbol: price.s.replace("USDT", ""),
      price: parseFloat(price.c).toFixed(3),
      change: parseFloat(price.P).toFixed(2) + "%",
      changeUsd: parseFloat(price.p).toString(),
      divideToBTC:
        price.s === "BTCUSDT"
          ? ""
          : parseFloat(
              parseInt(price.c) / parseInt(this.BTCPrice),
            ).toFixed(4).toString(),
    });
  }
  static mapCoinsToArray() {
    const data: PriceChange[] = []
     this.coins.forEach((value, key)=> {
      data.push(value)
    })
     return  data.sort((a, b) => a.order - b.order);
  }
  static mapParseEvent(event: MessageEvent): BinanceTicker {
    return JSON.parse(event.data).data;
  }
  static mapCoinsSymbolToGetUrlParam(coins: Coin[]) {
    return coins.map((coin) => coin.symbol.toLowerCase()).join("usdt@ticker/");
  }
}