import type { Coin } from "~/types/types";

/**
 * Narrows CoinGecko's `coins/markets` payload to what the table actually uses.
 *
 * The previous mapper spread the whole payload and the websocket mapper then
 * threw sixteen of those fields away, so market cap, circulating supply, the 24h
 * range and the all-time high were fetched on every refresh and discarded.
 *
 * Doing the projection here rather than at the socket boundary matters: the
 * fundamentals arrive over REST and must survive into the store, and only the
 * live half belongs to the ticker.
 *
 * Every numeric field is coerced to `number | null` rather than trusted, because
 * CoinGecko returns `null` for a coin with no cap and the table must be able to
 * tell "no market cap" from "zero market cap".
 */
export type CoinFundamentalDto = {
  symbol: string;
  id: string;
  name: string;
  image: string;
  marketCap: number | null;
  marketCapRank: number | null;
  fdv: number | null;
  volume24h: number | null;
  marketCapChange24h: number | null;
  changePercent24h: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  ath: number | null;
  athChangePercent: number | null;
  atl: number | null;
  high24h: number | null;
  low24h: number | null;
  spark7d: number[];
};

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Maps the REST list onto the Binance symbols the socket streams.
 *
 * The join key is the concatenated `BASEUSDT` pair, which is what both feeds
 * actually use. CoinGecko quotes in USD and Binance in USDT, so the two are not
 * interchangeable and the table says USDT where the number is a USD price.
 */
export function toCoinFundamentals(coins: Coin[]): CoinFundamentalDto[] {
  return coins.map((coin) => ({
    symbol: `${coin.symbol.toUpperCase()}USDT`,
    id: coin.id,
    name: coin.name,
    image: coin.image,
    marketCap: finite(coin.market_cap),
    marketCapRank: finite(coin.market_cap_rank),
    fdv: finite(coin.fully_diluted_valuation),
    volume24h: finite(coin.total_volume),
    marketCapChange24h: finite(coin.market_cap_change_percentage_24h),
    changePercent24h: finite(coin.price_change_percentage_24h),
    circulatingSupply: finite(coin.circulating_supply),
    totalSupply: finite(coin.total_supply),
    maxSupply: finite(coin.max_supply),
    ath: finite(coin.ath),
    athChangePercent: finite(coin.ath_change_percentage),
    atl: finite(coin.atl),
    high24h: finite(coin.high_24h),
    low24h: finite(coin.low_24h),
    spark7d: coin.sparkline_in_7d?.price ?? [],
  }));
}

/** Binance symbols worth subscribing to: USDT-quoted, unleveraged, spot. */
export function tradablePairs(coins: Coin[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const coin of coins) {
    const symbol = `${coin.symbol.toUpperCase()}USDT`;
    // Binance streams at most 1024 combined subscriptions, and a handful of these
    // pairs do not exist on the venue - subscribing to them wastes the budget.
    if (!/^[A-Z0-9]{2,15}USDT$/.test(symbol)) continue;
    if (
      coin.symbol.toUpperCase().includes("UP") ||
      coin.symbol.toUpperCase().includes("DOWN")
    ) {
      continue;
    }
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
  }

  return out;
}
