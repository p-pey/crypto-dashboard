import { container } from "tsyringe";
import { AxiosService } from "~/lib/axios";
import type { Coin } from "~/types/types";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { OverviewMapper } from "./overview.mapper";

const ApiService = container.resolve(AxiosService);

export const overviewRouter = createTRPCRouter({
  getFearAndGreedIndex: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ApiService.get(
      "https://api.alternative.me/fng/?limit=0&format=json",
    );
    return data;
  }),
  getPrices: publicProcedure.query(async () => {
    const { data } = await ApiService.get<Coin[]>(
      `https://api.binance.com/api/v3/ticker/price`,
    );
    return OverviewMapper.mapCoinsTo24Changes(OverviewMapper.mapCoinToGetUSDTPairs(data));
  }),
});
