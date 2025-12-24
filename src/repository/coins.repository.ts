import { AppSignleton } from "~/lib/container";
import type { Coin } from "~/types/types";

@AppSignleton()
export class CoinsRepository {
  private readonly _coinsRepo = new Map<string, Coin>();

  getCoin(id: string) {
    return this._coinsRepo.get(id);
  }
  getCoins() {
    return Array.from(this._coinsRepo.values());
  }
  setCoin(coin: Coin) {
    this._coinsRepo.set(coin.id, coin);
  }
  setCoins(coins: Coin[]) {
    coins.forEach((coin) => this._coinsRepo.set(coin.id, coin));
  }
}
