import { AxiosService } from "~/lib/axios";
import { AppContainer } from "~/lib/container";
import type { Coin } from "~/types/types";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

const ApiService = AppContainer.resolve(AxiosService);

export const overviewRouter = createTRPCRouter({
  getFearAndGreedIndex: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ApiService.get(
      "https://api.alternative.me/fng/?limit=0&format=json",
    );
    return data;
  }),
  getPrices: publicProcedure.query(async () => {
    const { data } = await ApiService.get<Coin[]>(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1`,
    );
    return data;
  }),
});
