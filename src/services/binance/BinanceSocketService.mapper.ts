import type { Coin } from "~/types/types";
import type { BinanceTicker } from "./BinanceSocketService.types";



export class BinanceSocketServiceMapper {
       static mapCoinToGetUSDTPairs(coins: BinanceTicker[]) {
              return coins.filter(coin => coin.s.endsWith("USDT"));
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
       static mapParseEvent(event: MessageEvent): BinanceTicker[] {
              return JSON.parse(event.data);
       }
}