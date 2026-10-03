import { z } from "zod";

import { AppContainer } from "~/lib/container";
import { aiRegistry } from "~/services/ai/AiRegistry";
import AnalyzeAiService, {
  toAnalyzeAiResult,
} from "~/services/macro/AnalyzeAiService";
import { buildCountryEconomy } from "~/services/macro/countryEconomy";
import MacroAnalysisService from "~/services/macro/MacroAnalysisService";
import type { Horizon } from "~/i18n/dictionaries/types";
import NewsCrawlerService from "~/services/news/NewsCrawlerService";
import { createTRPCRouter, publicProcedure } from "../trpc";

const Analyze = AppContainer.resolve(AnalyzeAiService);
const NewsCrawler = AppContainer.resolve(NewsCrawlerService);
const MacroAnalyzer = AppContainer.resolve(MacroAnalysisService);

const CountrySchema = z.enum(["unitedStates", "iran"]);
const HorizonSchema = z.enum([
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
]);

/** Mirrors the prefix `~/services/macro/countryEconomy` puts on factor ids. */
const ASPECT_PREFIX = "aspect:";

/**
 * The seam to the AI layer.
 *
 * These two procedures know that an AI exists and nothing else about how. Which
 * runtime answers, how it is addressed and whether it is even switched on is
 * resolved inside `~/services/ai`, so this file would not change if every
 * provider were replaced.
 *
 * The country and horizon labels arrive already translated, so the prompt names
 * the country the way the user is looking at it rather than by an internal id.
 */
export const llmRouter = createTRPCRouter({
  /**
   * Every registered runtime's reachability, not just the one that would be
   * used.
   *
   * Showing all of them is the point: a user with a local model running *and* a
   * cloud key set should be able to see that the local one will be preferred,
   * rather than discovering it after the fact.
   */
  status: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const registry = aiRegistry();
      // `force` is the re-check button. It has to reach each provider's own
      // probe, otherwise a runtime the user just started stays invisible behind
      // the server-side status cache.
      const statuses = await Promise.all(
        registry
          .all()
          .map((provider) => provider.probe({ force: input?.force })),
      );
      return { active: (await registry.active()).id, statuses };
    }),

  analyze: publicProcedure
    .input(
      z.object({
        country: CountrySchema,
        horizon: HorizonSchema,
        countryLabel: z.string().max(40),
        horizonLabel: z.string().max(40),
        /**
         * Which runtime to use. Omitted means "the app's preference order",
         * which is the right default; set only when a user has two keys and
         * wants to compare them.
         */
        providerId: z
          .enum(["local", "gemini", "groq", "openrouter"])
          .optional(),
      }),
    )
    .mutation(async ({ input, signal }) => {
      const snapshot = await NewsCrawler.getSnapshot();
      const analysis = await MacroAnalyzer.analyze();
      const economy = buildCountryEconomy({
        country: input.country,
        articles: snapshot.articles,
        sourceWeights: snapshot.sources,
        now: snapshot.fetchedAt,
      });

      // The model may only name channels that actually had coverage, so its
      // vocabulary comes from the scorecard rather than from a hardcoded list
      // that would drift out of date. The `aspect:` prefix is stripped because
      // it is an internal id the model has to echo back verbatim.
      const aspects = economy.factors.map((factor) =>
        factor.id.startsWith(ASPECT_PREFIX)
          ? factor.id.slice(ASPECT_PREFIX.length)
          : factor.id,
      );

      const horizon: Horizon = input.horizon;

      const result = await Analyze.run(
        {
          countryName: input.countryLabel,
          countryCode: economy.code,
          horizonLabel: input.horizonLabel,
          tone: economy.tone,
          risk: economy.risk,
          pressure: economy.pressure,
          confidence: economy.confidence,
          coverage: economy.coverage,
          relevance: economy.relevance,
          flowMomentum: economy.flowMomentum,
          headlines24h: economy.headlines24h,
          aspects,
          factors: economy.factors,
          flow: economy.flow,
          digest: economy.digest,
          forecasts: analysis.forecasts.map((forecast) => {
            const selected =
              forecast.byHorizon.find((entry) => entry.horizon === horizon) ??
              forecast.headline;
            return {
              asset: forecast.asset,
              driftPercent: selected?.driftPercent ?? null,
              band: selected?.band ?? null,
              confidence: selected?.confidence ?? null,
              verdict: selected?.verdict ?? "neutral",
            };
          }),
        },
        { signal, providerId: input.providerId },
      );

      return toAnalyzeAiResult(result);
    }),
});
