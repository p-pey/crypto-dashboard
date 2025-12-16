import type { Coin } from "~/types/types";

export class OverviewMapper {
       static mapCoinsToAddOrder(coins: Coin[]) {
         console.log(coins);
              return coins.map((coin, index) => {
                return { ...coin, order: index + 1 };
              });
       }
}
