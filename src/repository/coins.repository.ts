import { AppSignleton } from "~/lib/container";
import type { PriceChange } from "~/services/binance/BinanceSocketService.types";

@AppSignleton()
export class CoinsRepository {
  private readonly _coinsRepo = new Map<string, PriceChange>();

  getCoin(id: string) {
    return this._coinsRepo.get(id);
  }
  getCoins() {
    return Array.from(this._coinsRepo.values());
  }
  setCoin(coin: PriceChange) {
    this._coinsRepo.set(coin.symbol, coin);
  }
  setCoins(coins: PriceChange[]) {
    coins.forEach((coin) => this._coinsRepo.set(coin.symbol, coin));
  }
}
