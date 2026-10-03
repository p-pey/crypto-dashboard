import { z } from "zod";

import { DEFAULT_COUNTRY } from "~/constants/countries";
import { AppContainer } from "~/lib/container";
import MacroAnalysisService from "~/services/macro/MacroAnalysisService";
import { buildCountryEconomy } from "~/services/macro/countryEconomy";
import NewsCrawlerService from "~/services/news/NewsCrawlerService";
import { createTRPCRouter, publicProcedure } from "../trpc";

/**
 * Mirrors `CountryId`. Written out rather than derived from `COUNTRY_IDS` so
 * the wire contract is a literal the client can import as a type.
 */
const CountrySchema = z.enum(["unitedStates", "iran"]);

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

  /**
   * One country's economic scorecard: gauges, hourly flow, factor breakdown and
   * a headline distribution, all derived from the same crawl.
   *
   * Switching country costs nothing upstream — the snapshot is already in
   * memory and is partitioned by outlet — so this returns whichever country was
   * asked for rather than caching per country.
   */
  economy: publicProcedure
    .input(
      z
        .object({
          country: CountrySchema.default(DEFAULT_COUNTRY),
          force: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const country = input?.country ?? DEFAULT_COUNTRY;
      const snapshot = await NewsCrawler.getSnapshot({ force: input?.force });

      return {
        selected: buildCountryEconomy({
          country,
          articles: snapshot.articles,
          sourceWeights: snapshot.sources,
          now: snapshot.fetchedAt,
        }),
        fetchedAt: snapshot.fetchedAt,
        stale: snapshot.stale,
        error: snapshot.error,
      };
    }),

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
        tierCoverage: snapshot.tierCoverage,
        riskAggregate: snapshot.riskAggregate,
        fetchedAt: snapshot.fetchedAt,
        stale: snapshot.stale,
        error: snapshot.error,
        total: snapshot.articles.length,
      };
    }),
});
