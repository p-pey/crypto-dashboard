import { postRouter } from "~/server/api/routers/post";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { overviewRouter } from "./overview/overview.router";
import { EtfRouter } from "./etf/etf.router";
import { iranRouter } from "./iran/iran.router";
import { candlesRouter } from "./candles/candles.router";
import { nerkhRouter } from "./nerkh/nerkh.router";
import { tgjuRouter } from "./tgju/tgju.router";
import { macroRouter } from "./macro/macro.router";
import { llmRouter } from "./llm/llm.router";
import { derivativesRouter } from "./derivatives/derivatives.router";
import { statusesRouter } from "./statuses/statuses.service";
import { tradingRouter } from "./trading/trading.router";
import { insightsRouter } from "./insights/insights.router";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  overview: overviewRouter,
  etf: EtfRouter,
  iran: iranRouter,
  candles: candlesRouter,
  nerkh: nerkhRouter,
  tgju: tgjuRouter,
  macro: macroRouter,
  llm: llmRouter,
  derivatives: derivativesRouter,
  statuses: statusesRouter,
  trading: tradingRouter,
  insights: insightsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
