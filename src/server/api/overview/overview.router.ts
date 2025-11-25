import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import axios from "axios";
import { OverviewMapper } from "./overview.mapper";

export const overviewRouter = createTRPCRouter({
  getFearAndGreedIndex: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await axios.get(
      "https://api.alternative.me/fng/?limit=0&format=json",
    );
    return data;
  }),
  getPrices: publicProcedure.query(async () => {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true`,
    );
    console.log(response.data);
    return OverviewMapper.mapCoinsTo24Changes(response.data);
  }),
});
