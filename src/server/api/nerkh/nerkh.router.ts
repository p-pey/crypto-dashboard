import { z } from "zod";

import { AppContainer } from "~/lib/container";
import NerkhCrawlerService from "~/services/nerkh/NerkhCrawlerService";
import { createTRPCRouter, publicProcedure } from "../trpc";

const NerkhCrawler = AppContainer.resolve(NerkhCrawlerService);

export const nerkhRouter = createTRPCRouter({
  /**
   * Live Iranian market rates: gold and coins, fiat currencies and the crypto
   * pairs nerkh.io tracks, in Toman with the 1h and 12h extremes.
   */
  getSnapshot: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .query(({ input }) => NerkhCrawler.getSnapshot({ force: input?.force })),
});
