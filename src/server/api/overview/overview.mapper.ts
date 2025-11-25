import type { Coin } from "~/types/types";

export class OverviewMapper {
  static mapCoinsTo24Changes(coins: Coin[]) {
    return coins.map((coin) => {
      return {
        sparkline: coin.sparkline_in_7d.price,
        priceChangePercentage24h: coin.price_change_percentage_24h,
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol,
      };
    });
  }
}
