import type { Coin } from "~/types/types";

export class OverviewMapper {
  static mapCoinToGetUSDTPairs(coins: Coin[]) {
    return coins.filter(coin => coin.symbol.endsWith("USDT"));
  }
  static mapCoinsTo24Changes(coins: Coin[]) {
    console.log(coins);
    return coins.map((coin) => {
      return {
        id: coin.symbol,
        name: coin.symbol,
        symbol: coin.symbol,
        price: coin.price
      };
    });
  }
}
