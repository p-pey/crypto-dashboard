import { z } from "zod";

import { AppContainer } from "~/lib/container";
import CandleService from "~/services/candles/CandleService";
import {
  CANDLE_INTERVALS,
  CANDLE_SYMBOLS,
  CANDLE_SPECS,
} from "~/services/candles/candle.types";
import { createTRPCRouter, publicProcedure } from "../trpc";

const Candles = AppContainer.resolve(CandleService);

const symbolSchema = z.enum(CANDLE_SYMBOLS);
const intervalSchema = z.enum(CANDLE_INTERVALS);

export const candlesRouter = createTRPCRouter({
  /** One instrument's candlestick series at one interval. */
  get: publicProcedure
    .input(
      z.object({
        symbol: symbolSchema,
        interval: intervalSchema.default("15m"),
        limit: z.number().int().min(20).max(1000).optional(),
        force: z.boolean().optional(),
      }),
    )
    .query(({ input }) =>
      Candles.getSeries(input.symbol, input.interval, {
        limit: input.limit,
        force: input.force,
      }),
    ),

  /** Catalogue for the symbol picker, so the UI never hard-codes the list. */
  catalogue: publicProcedure.query(() =>
    CANDLE_SYMBOLS.map((symbol) => {
      const spec = CANDLE_SPECS[symbol];
      return {
        symbol,
        labelKey: spec.labelKey,
        source: spec.source,
        aggregated: spec.source === "nerkh",
      };
    }),
  ),
});
