import { z } from "zod";

import { AppContainer } from "~/lib/container";
import TgjuCrawlerService from "~/services/tgju/TgjuCrawlerService";
import { createTRPCRouter, publicProcedure } from "../trpc";

const TgjuCrawler = AppContainer.resolve(TgjuCrawlerService);

export const tgjuRouter = createTRPCRouter({
  /**
   * Iranian market rates scraped from TGJU's server-rendered boards: the
   * reference quotes for dollar, gold and coins plus every Iranian
   * exchange's USDT line from the `markets-local` table, in Rial.
   *
   * Together with nerkh.io this is one half of the board's automatic
   * failover: each instrument is quoted by both aggregators, so when one
   * crawl fails the other's rows keep the board populated.
   */
  getSnapshot: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .query(({ input }) => TgjuCrawler.getSnapshot({ force: input?.force })),
});
