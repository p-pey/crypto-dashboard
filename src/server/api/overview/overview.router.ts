import { z } from "zod";

import { AxiosService } from "~/lib/axios";
import { AppContainer } from "~/lib/container";
import type { Coin } from "~/types/types";
import { createTRPCRouter, publicProcedure } from "../trpc";
import CoinMarketCapService from "./CoinMarketCapService";
import MarketStatsService from "./MarketStatsService";
import { toCoinFundamentals, tradablePairs } from "./overview.mapper";

const ApiService = AppContainer.resolve(AxiosService);
const MarketStats = AppContainer.resolve(MarketStatsService);
const CoinMarketCap = AppContainer.resolve(CoinMarketCapService);

/** CoinGecko's free tier allows a few calls a minute; more rows means slower refreshes. */
const MARKETS_PATH =
  "https://api.coingecko.com/api/v3/coins/markets" +
  "?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true" +
  "&price_change_percentage=24h";

export const overviewRouter = createTRPCRouter({
  /**
   * Whole-market figures: total capitalisation, 24h volume, BTC/ETH dominance,
   * plus the Fear & Greed index and its 90 day history.
   *
   * **Was `protectedProcedure` and therefore unreachable** — this app has no
   * sign-in flow, so the procedure could never be called. The data was being
   * fetched for one coin's status panel all along, with no standalone view.
   */
  getMarketStats: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .query(({ input }) => MarketStats.getAll({ force: input?.force })),

  /**
   * CoinMarketCap extras: categories, exchange rankings and derivatives.
   *
   * Every field is null without a Pro key. Nothing here is required by the app,
   * so a missing key degrades to the free sources rather than an error.
   */
  getCoinMarketCap: publicProcedure.query(async () => ({
    status: CoinMarketCap.status(),
    categories: await CoinMarketCap.categories(),
    exchanges: await CoinMarketCap.exchanges(),
    derivatives: await CoinMarketCap.derivatives(),
  })),

  /**
   * The top hundred coins by market capitalisation.
   *
   * Ordered by market cap on the wire, but the table sorts by the returned
   * `marketCap` field itself rather than trusting the response order, so the
   * default sort is a property of the table rather than of this request.
   */
  getPrices: publicProcedure.query(async () => {
    const { data } = await ApiService.get<Coin[]>(MARKETS_PATH, {
      // CoinGecko rejects requests without a User-Agent outright.
      headers: { Accept: "application/json" },
    });
    return toCoinFundamentals(data);
  }),

  /**
   * The Binance pairs to subscribe to.
   *
   * Returned separately so the client can build one stream URL rather than
   * re-deriving the symbol list, and so the two feeds cannot disagree about which
   * pairs exist.
   */
  getTradablePairs: publicProcedure.query(async () => {
    const { data } = await ApiService.get<Coin[]>(MARKETS_PATH, {
      headers: { Accept: "application/json" },
    });
    return tradablePairs(data);
  }),
});
