import { z } from "zod";

import { AppContainer } from "~/lib/container";
import DerivativesService from "~/services/derivatives/DerivativesService";
import LiquidationsService from "~/services/derivatives/LiquidationsService";
import PerpMarketService from "~/services/derivatives/PerpMarketService";
import { createTRPCRouter, publicProcedure } from "../trpc";

const Derivatives = AppContainer.resolve(DerivativesService);
const PerpMarket = AppContainer.resolve(PerpMarketService);
const Liquidations = AppContainer.resolve(LiquidationsService);

/** Uppercase alphanumerics only — an unvalidated symbol reaches six venue URLs. */
const symbol = z.string().regex(/^[A-Za-z0-9]{2,20}$/, "not a coin symbol");

/**
 * The free CoinGlass: perpetuals, funding, options and liquidations, read from
 * the venues' own public endpoints rather than from a paid aggregator.
 *
 * Three procedures because they degrade differently, and merging them would lose
 * that:
 *
 * - `get` — options and a single coin's funding history from Deribit. The most
 *   complete single source there is, and the only one with an expiry ladder.
 * - `perps` — the cross-venue matrix. Every venue settles independently, so a
 *   partial answer with a `venues` report of what did not answer is more useful
 *   than an error.
 * - `liquidations` — the two venues that publish a forced-close tape, with the
 *   four that publish nothing named as unsupported rather than silently absent.
 */
export const derivativesRouter = createTRPCRouter({
  get: publicProcedure
    .input(
      z
        .object({
          currency: z.string().min(2).max(10).optional(),
          force: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ input }) =>
      Derivatives.getSnapshot({
        currency: input?.currency ?? "BTC",
        force: input?.force,
      }),
    ),

  /**
   * The cross-venue perps board.
   *
   * Defaults to the four coins with the deepest perps books, which are also the
   * four a reader would pick, and is capped at eight: beyond that the venues
   * that bill per symbol (Deribit, OKX, MEXC) make a refresh expensive enough to
   * get the cheap venues throttled along with them.
   */
  perps: publicProcedure
    .input(
      z
        .object({
          symbols: z.array(symbol).max(8).optional(),
          force: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ input }) =>
      PerpMarket.getSnapshot({ symbols: input?.symbols, force: input?.force }),
    ),

  /**
   * Forced liquidations.
   *
   * `symbols` narrows the ask for the venues that require a per-coin request.
   * With none given, the two publishing venues return their own recent tape
   * rather than nothing.
   */
  liquidations: publicProcedure
    .input(
      z
        .object({
          symbols: z.array(symbol).max(8).optional(),
          force: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ input }) =>
      Liquidations.getSnapshot({
        symbols: input?.symbols,
        force: input?.force,
      }),
    ),
});
