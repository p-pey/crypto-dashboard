import { z } from "zod";

import { AppContainer } from "~/lib/container";
import MacroAnalysisService from "~/services/macro/MacroAnalysisService";
import NewsCrawlerService from "~/services/news/NewsCrawlerService";
import { createTRPCRouter, publicProcedure } from "../trpc";

const MacroAnalyzer = AppContainer.resolve(MacroAnalysisService);
const NewsCrawler = AppContainer.resolve(NewsCrawlerService);

export const macroRouter = createTRPCRouter({
  /**
   * Dollar and gold projections across five horizons, built from the crawled
   * Iranian news feeds and the live nerkh.io rates.
   */
  analyze: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .query(({ input }) => MacroAnalyzer.analyze({ force: input?.force })),

  /** The raw scored feed, for the headlines panel. */
  headlines: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(120).optional(),
          force: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const snapshot = await NewsCrawler.getSnapshot({ force: input?.force });
      const limit = input?.limit ?? 40;
      return {
        articles: snapshot.articles.slice(0, limit),
        sources: snapshot.sources,
        drivers: snapshot.drivers,
        coverage: snapshot.coverage,
        aggregate: snapshot.aggregate,
        fetchedAt: snapshot.fetchedAt,
        stale: snapshot.stale,
        error: snapshot.error,
        total: snapshot.articles.length,
      };
    }),
});
