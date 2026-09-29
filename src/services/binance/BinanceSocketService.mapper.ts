import type { Coin } from "~/types/types";
import type { BinanceTicker, PriceChange } from "./BinanceSocketService.types";

export class BinanceSocketServiceMapper {
  static BTCPrice: PriceChange["price"];
  static coins: Map<string, PriceChange> = new Map<string, PriceChange>();
  static mapCoinsToFindOrder(calledCoins: Coin[], target: BinanceTicker) {
    return calledCoins.find(
      (item) => `${item.symbol.toUpperCase()}USDT` === target.s,
    )!;
  }

  static mapPriceToObject(price: BinanceTicker, targetCoin: Coin) {
    if (price.s === "BTCUSDT") {
      this.BTCPrice = parseFloat(price.c).toFixed(4);
    }
    this.coins.set(price.s, {
      key: price.s,
      order: targetCoin.order,
      image: targetCoin.image,
      id: targetCoin.id,
      name: targetCoin.name,
      symbol: price.s.replace("USDT", ""),
      price: parseFloat(price.c).toFixed(3),
      change: parseFloat(price.P).toFixed(2) + "%",
      changeUsd: parseFloat(price.p).toString(),
      divideToBTC:
        price.s === "BTCUSDT" || !this.BTCPrice
          ? ""
          : (parseFloat(price.c) / parseFloat(this.BTCPrice)).toFixed(4),
    });
  }
  static mapCoinsToArray() {
    const data: PriceChange[] = Array.from(this.coins.values()).map((coin) => {
      return coin;
    });
    return data.sort((a, b) => a.order - b.order);
  }
  static mapParseEvent(event: MessageEvent): BinanceTicker {
    const parsed = JSON.parse(event.data as string) as {
      data: BinanceTicker;
    };
    return parsed.data;
  }
  static mapCoinsSymbolToGetUrlParam(coins: Coin[]) {
    return coins.map((coin) => coin.symbol.toLowerCase()).join("usdt@ticker/");
  }
}
