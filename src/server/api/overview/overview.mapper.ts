import type { Coin } from "~/types/types";

export class OverviewMapper {
  static mapCoinsToAddOrder(coins: Coin[]) {
    return coins.map((coin, index) => {
      return { ...coin, order: index + 1 };
    });
  }
}
