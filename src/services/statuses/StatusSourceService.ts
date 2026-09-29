import { AxiosService } from "~/lib/axios";
import { AppContainer } from "~/lib/container";
import { atrPercent, macd, percentChange, rsi, sma } from "./indicators";
import { headlineSentiment, parseRssItems } from "./sentiment.lexer";
import type {
  Candle,
  StatusMarketSnapshot,
  StatusNewsItem,
  StatusTechnicals,
} from "./statuses.types";

const BROWSER_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

const KLINE_LIMIT = 210;

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  ...unknown[],
];

type CoinGeckoDetail = {
  id: string;
  name: string;
  symbol: string;
  image?: { large?: string; small?: string; thumb?: string };
  market_cap_rank?: number | null;
  watchlist_portfolio_users?: number | null;
  sentiment_votes_up_percentage?: number | null;
  categories?: string[] | null;
  market_data?: {
    current_price?: { usd?: number };
    ath_change_percentage?: { usd?: number };
    total_volume?: { usd?: number };
    price_change_percentage_24h?: number;
    price_change_percentage_7d?: number;
  };
};

type FearAndGreedResponse = {
  data?: { value?: string; value_classification?: string }[];
};

export type CollectResult<T> = {
  data: T | null;
  error: string | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Every collector is independent and failure tolerant: an unreachable source
 * yields `{ data: null }` rather than throwing, and the caller drops that signal
 * from the composite instead of treating it as neutral.
 */
const ApiService = AppContainer.resolve(AxiosService);

export class StatusSourceService {
  private readonly api = ApiService;

  /** Only plain alnum symbols can be trusted as a Binance pair. */
  toBinancePair(symbol: string): string | null {
    const clean = symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (clean.length < 2 || clean.length > 14) return null;
    if (clean === "USDT" || clean === "USDC") return null;
    return `${clean}USDT`;
  }

  async collectTechnicals(
    symbol: string,
  ): Promise<CollectResult<StatusTechnicals>> {
    const pair = this.toBinancePair(symbol);
    if (!pair) {
      return { data: null, error: `unsupported symbol "${symbol}"` };
    }

    try {
      const { data } = await this.api.get<BinanceKline[]>(
        `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1h&limit=${KLINE_LIMIT}`,
        { headers: BROWSER_HEADERS, timeout: 8000 },
      );

      if (!Array.isArray(data) || data.length === 0) {
        return { data: null, error: "empty klines" };
      }

      const candles: Candle[] = data.map((row) => ({
        time: Number(row[0]),
        open: toNumber(row[1]) ?? 0,
        high: toNumber(row[2]) ?? 0,
        low: toNumber(row[3]) ?? 0,
        close: toNumber(row[4]) ?? 0,
        volume: toNumber(row[5]) ?? 0,
      }));

      const closes = candles.map((candle) => candle.close);
      const last = closes[closes.length - 1] ?? null;
      const macdResult = macd(closes);

      return {
        data: {
          symbol: pair,
          price: last,
          sma20: sma(closes, 20),
          sma50: sma(closes, 50),
          sma200: sma(closes, 200),
          rsi14: rsi(closes, 14),
          macd: macdResult?.macd ?? null,
          macdSignal: macdResult?.signal ?? null,
          macdHistogram: macdResult?.histogram ?? null,
          atrPct: atrPercent(candles, 14),
          change24h: percentChange(closes, 24),
          change7d: percentChange(closes, 168),
          candles: candles.length,
        },
        error: null,
      };
    } catch (error) {
      return { data: null, error: messageOf(error) };
    }
  }

  async collectCoinGecko(
    coinId: string,
  ): Promise<CollectResult<StatusMarketSnapshot>> {
    try {
      const { data } = await this.api.get<CoinGeckoDetail>(
        `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`,
        { headers: BROWSER_HEADERS, timeout: 10000 },
      );

      return {
        data: {
          marketCapRank: toNumber(data.market_cap_rank),
          watchlistUsers: toNumber(data.watchlist_portfolio_users),
          votesUpPercent: toNumber(data.sentiment_votes_up_percentage),
          athChangePercent: toNumber(
            data.market_data?.ath_change_percentage?.usd,
          ),
          currentPrice: toNumber(data.market_data?.current_price?.usd),
          totalVolume: toNumber(data.market_data?.total_volume?.usd),
          priceChangePercent24h: toNumber(
            data.market_data?.price_change_percentage_24h,
          ),
          categories: (data.categories ?? []).filter(Boolean).slice(0, 5),
          fearAndGreed: null,
          fearAndGreedLabel: null,
        },
        error: null,
      };
    } catch (error) {
      return { data: null, error: messageOf(error) };
    }
  }

  /** Market wide, not per coin. Cached for the lifetime of the process. */
  private fearAndGreed: Promise<
    CollectResult<{
      value: number | null;
      label: string | null;
    }>
  > | null = null;

  async collectFearAndGreed(): Promise<
    CollectResult<{ value: number | null; label: string | null }>
  > {
    this.fearAndGreed ??= (async () => {
      try {
        const { data } = await this.api.get<FearAndGreedResponse>(
          "https://api.alternative.me/fng/?limit=1&format=json",
          { headers: BROWSER_HEADERS, timeout: 6000 },
        );
        const entry = data.data?.[0];
        return {
          data: {
            value: toNumber(entry?.value),
            label: entry?.value_classification ?? null,
          },
          error: null,
        };
      } catch (error) {
        return { data: null, error: messageOf(error) };
      }
    })();

    return this.fearAndGreed;
  }

  async collectNews(
    name: string,
    symbol: string,
    limit = 8,
  ): Promise<CollectResult<StatusNewsItem[]>> {
    const query = encodeURIComponent(
      `"${name}" OR ${symbol} cryptocurrency price`,
    );
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

    try {
      const { data } = await this.api.get<string>(url, {
        headers: { ...BROWSER_HEADERS, Accept: "application/rss+xml, */*" },
        responseType: "text",
        timeout: 8000,
      });

      const xml = typeof data === "string" ? data : "";
      const items = parseRssItems(xml, limit);

      return {
        data: items.map((item) => ({
          title: item.title,
          source: item.title.split(" - ").pop()?.trim() ?? "unknown",
          link: item.link,
          publishedAt: item.publishedAt,
          sentiment: headlineSentiment(item.title),
        })),
        error: null,
      };
    } catch (error) {
      return { data: null, error: messageOf(error) };
    }
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("ECONNABORTED") || error.message === "timeout") {
      return "timed out";
    }
    const status = /status code (\d{3})/.exec(error.message)?.[1];
    return status ? `HTTP ${status}` : error.message;
  }
  return "request failed";
}
