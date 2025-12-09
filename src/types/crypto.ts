export interface Coin {
       id: string;
       rank: number;
       name: string;
       symbol: string;
       logo: string;
       price: number;
       change1h: number;
       change24h: number;
       change7d: number;
       marketCap: number;
       volume24h: number;
       circulatingSupply: number;
       sparklineData: number[];
}

export interface ETF {
       id: string;
       name: string;
       symbol: string;
       logo: string;
       price: number;
       change24h: number;
       aum: number;
       volume24h: number;
       sparklineData: number[];
       holdings: string[];
}

export interface MarketStats {
       totalMarketCap: number;
       totalVolume24h: number;
       btcDominance: number;
       ethDominance: number;
       totalCryptos: number;
       totalExchanges: number;
       marketCapChange24h: number;
}

export interface TrendingCoin {
       id: string;
       name: string;
       symbol: string;
       logo: string;
       price: number;
       change24h: number;
}
