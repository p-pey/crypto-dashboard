import { z } from "zod";
import { AppContainer } from "~/lib/container";
import { StatusesRepository } from "~/repository/statuses.repository";
import { StatusAnalyzerService } from "~/services/statuses/StatusAnalyzerService";
import { createTRPCRouter, publicProcedure } from "../trpc";

const Analyzer = AppContainer.resolve(StatusAnalyzerService);
const Repo = AppContainer.resolve(StatusesRepository);

export const analyzeSchema = z.object({
  coinId: z.string().min(1).max(120),
  symbol: z.string().min(1).max(24),
  name: z.string().max(80).optional(),
  image: z.string().max(500).nullish(),
  /** Skip the 24h cache and re-run every source. */
  force: z.boolean().optional(),
});

const coinSchema = z.object({
  coinId: z.string().min(1).max(120),
  symbol: z.string().min(1).max(24),
  name: z.string().max(80).optional(),
  image: z.string().max(500).nullish(),
});

export const statusesRouter = createTRPCRouter({
  /**
   * The cached daily status for a coin, analysing it on demand the first time
   * it is requested. This is what the expand button in the coin table calls.
   */
  getStatus: publicProcedure.input(analyzeSchema).query(async ({ input }) => {
    const cached = input.force ? null : Repo.get(input.coinId);
    if (cached) return { status: cached, cached: true };

    const status = await Analyzer.analyze(input);
    return { status, cached: false };
  }),

  /** Every status currently cached, used to paint badges without re-analysing. */
  listCached: publicProcedure.query(() => ({
    statuses: Repo.all(),
    count: Repo.size,
  })),

  /**
   * Batch entry point for the daily cron. Analyses the given coins and
   * refreshes any that are already cached.
   */
  refreshBatch: publicProcedure
    .input(
      z.object({
        coins: z.array(coinSchema).min(1).max(50),
        refreshExisting: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const results = await Promise.allSettled(
        input.coins.map((coin) =>
          Analyzer.analyze({
            ...coin,
            force: input.refreshExisting ?? true,
          }),
        ),
      );

      const succeeded = results
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value as { coinId: string; verdict: string });

      return {
        requested: input.coins.length,
        succeeded: succeeded.length,
        failed: results.length - succeeded.length,
        statuses: succeeded,
      };
    }),
});
