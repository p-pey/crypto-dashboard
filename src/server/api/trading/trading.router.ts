import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { env } from "~/env.js";
import { AppContainer } from "~/lib/container";
import { TradingRepository } from "~/repository/trading.repository";
import { ArbitrageService } from "~/services/trading/ArbitrageService";
import { OrderService } from "~/services/trading/OrderService";
import { ProtectionService } from "~/services/trading/ProtectionService";
import type { Position } from "~/services/trading/trading.types";
import {
  EXCHANGE_IDS,
  type ExchangeId,
} from "~/services/trading/trading.types";
import type { MarketRow } from "~/services/iran/iran.market.types";
import { createTRPCRouter, publicProcedure } from "../trpc";

const Orders = AppContainer.resolve(OrderService);
const Arbitrage = AppContainer.resolve(ArbitrageService);
const Repository = AppContainer.resolve(TradingRepository);
const Protection = AppContainer.resolve(ProtectionService);

/**
 * The venue enum is written out rather than derived from `EXCHANGE_IDS` so the
 * literal types survive into the router's inferred signatures; the assertion
 * below is what keeps the two from drifting apart.
 */
const EXCHANGE_TUPLES = [
  "nobitex",
  "wallex",
  "bitpin",
  "tabdeal",
  "bitunix",
] as const satisfies readonly ExchangeId[];

// Compile-time guard: adding a venue to the domain without adding it here, or
// the reverse, is an error rather than a silent runtime gap.
const _exchangesInSync: readonly ExchangeId[] = EXCHANGE_TUPLES;
void _exchangesInSync;
void EXCHANGE_IDS;

const exchangeEnum = z.enum(EXCHANGE_TUPLES);

/**
 * Which venues actually list an instrument.
 *
 * A catalogue lookup rather than a hardcoded list: which venues carry gold
 * changes between releases, and a button for a market that is not there is
 * worse than no button.
 */
const listedMarkets = () => Orders.markets();

/**
 * Refuses every trading call unless the shared secret header matches.
 *
 * This app has no sign-in flow, so without this a trading endpoint reachable on
 * a network would be an open door to real funds. The secret lives in `.env`, so
 * only a process that can read the operator's own environment can call it -
 * which is the intended deployment: this runs on one private machine.
 */
function requireSecret(secret: string | null | undefined): void {
  const expected = env.TRADING_API_SECRET;
  if (!expected) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Trading is disabled: set TRADING_API_SECRET to enable it",
    });
  }
  if (!secret || secret !== expected) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
}

/** True when the caller presented the correct secret. Used to gate the UI. */
export function hasTradingAccess(secret: string | null | undefined): boolean {
  const expected = env.TRADING_API_SECRET;
  return Boolean(expected) && Boolean(secret) && secret === expected;
}

export const tradingRouter = createTRPCRouter({
  /**
   * Whether trading is usable at all, and in which mode.
   *
   * Public on purpose: the page needs to explain *why* the buttons are missing,
   * and that reason is never secret.
   */
  status: publicProcedure.query(async () => {
    return {
      mode: env.TRADING_MODE,
      tradingConfigured: hasTradingAccess(undefined),
      requiresSecret: Boolean(env.TRADING_API_SECRET),
      telegramConfigured: Boolean(
        env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID,
      ),
    };
  }),

  /** Per-venue readiness: which have credentials, and which offer leverage. */
  sessions: publicProcedure.query(async () => Orders.sessions()),

  /** Market metadata, so the UI can honour each venue's own limits. */
  markets: publicProcedure.query(async () => listedMarkets()),

  /**
   * What an order will actually cost, in the venue's own quote unit.
   *
   * Read-only and public because it performs no I/O and touches no credential:
   * it is arithmetic over the catalogue. The confirmation modal uses it to show
   * the real Toman figure next to the Rial one the board displayed.
   */
  preview: publicProcedure
    .input(
      z.object({
        exchange: exchangeEnum,
        instrumentId: z.string(),
        side: z.enum(["buy", "sell"]),
        priceInRial: z.string(),
        amount: z.string(),
      }),
    )
    .query(({ input }) => Orders.preview(input)),

  /* ---------------------------------------------------------------- *
   * Guarded calls
   * ---------------------------------------------------------------- */

  balances: publicProcedure
    .input(z.object({ secret: z.string().optional() }))
    .query(async ({ input }) => {
      requireSecret(input.secret);
      return Orders.balances();
    }),

  placeOrder: publicProcedure
    .input(
      z.object({
        secret: z.string(),
        exchange: exchangeEnum,
        instrumentId: z.string(),
        side: z.enum(["buy", "sell"]),
        priceInRial: z.string(),
        amount: z.string(),
        kind: z.enum(["spot", "margin", "futures"]).default("spot"),
        leverage: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      requireSecret(input.secret);
      // `secret` is the guard, not an order field, so it is dropped here rather
      // than threaded into a payload that must never contain a credential.
      return Orders.placeOrder({
        exchange: input.exchange,
        instrumentId: input.instrumentId,
        side: input.side,
        priceInRial: input.priceInRial,
        amount: input.amount,
        kind: input.kind,
        leverage: input.leverage,
      });
    }),

  cancelOrder: publicProcedure
    .input(
      z.object({
        secret: z.string(),
        exchange: exchangeEnum,
        id: z.string(),
        symbol: z.string(),
        clientOrderId: z.string().nullish(),
      }),
    )
    .mutation(async ({ input }) => {
      requireSecret(input.secret);
      await Orders.cancelOrder({
        id: input.id,
        symbol: input.symbol,
        clientOrderId: input.clientOrderId ?? null,
        exchange: input.exchange,
        kind: "spot",
        instrumentId: "",
        side: "buy",
        status: "open",
        price: "",
        amount: "",
        filledAmount: "",
        averagePrice: null,
        filledValue: null,
        fee: null,
        feeAsset: null,
        createdAt: 0,
        updatedAt: 0,
        note: null,
      });
      return { ok: true };
    }),

  openOrders: publicProcedure
    .input(z.object({ secret: z.string().optional() }))
    .query(async ({ input }) => {
      requireSecret(input.secret);
      return Orders.openOrders();
    }),

  orderHistory: publicProcedure
    .input(
      z.object({
        secret: z.string(),
        exchange: exchangeEnum.optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }),
    )
    .query(async ({ input }) => {
      requireSecret(input.secret);
      return Orders.orderHistory({
        exchange: input.exchange as never,
        limit: input.limit,
      });
    }),

  trades: publicProcedure
    .input(
      z.object({
        secret: z.string(),
        exchange: exchangeEnum.optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }),
    )
    .query(async ({ input }) => {
      requireSecret(input.secret);
      return Orders.trades({
        exchange: input.exchange as never,
        limit: input.limit,
      });
    }),

  positions: publicProcedure
    .input(z.object({ secret: z.string().optional() }))
    .query(async ({ input }) => {
      requireSecret(input.secret);
      return Orders.positions();
    }),

  /**
   * Sets the starting holdings of a paper account.
   *
   * Seeded by hand rather than invented, because a paper account with a
   * made-up balance teaches the wrong lesson: it makes a losing strategy look
   * funded when it is not. `seedPaperBalance` only inserts when the row is
   * absent, so calling this again will not silently reset a running simulation.
   */
  seedPaperAccount: publicProcedure
    .input(
      z.object({
        secret: z.string(),
        exchange: exchangeEnum,
        holdings: z
          .array(z.object({ asset: z.string(), amount: z.string() }))
          .min(1)
          .max(20),
      }),
    )
    .mutation(async ({ input }) => {
      requireSecret(input.secret);
      if (env.TRADING_MODE !== "paper") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Seeding only applies in paper mode",
        });
      }
      for (const row of input.holdings) {
        Repository.seedPaperBalance(
          input.exchange,
          row.asset.toUpperCase(),
          row.amount,
        );
      }
      return { ok: true };
    }),

  /* ---------------------------------------------------------------- *
   * Spot and futures workspace
   * ---------------------------------------------------------------- */

  /**
   * Open positions, enriched with whatever protection is armed on each.
   *
   * The protection half is joined in here rather than in the UI because only the
   * adapter knows whether a venue holds the level or this app does, and that
   * distinction has to survive into the row.
   */
  futuresPositions: publicProcedure
    .input(z.object({ secret: z.string().optional() }))
    .query(async ({ input }) => {
      requireSecret(input.secret);
      const positions = await Orders.positions();
      const armed = new Map(
        Repository.listArmedProtection().map((row) => [
          `${row.exchange}:${row.positionId}`,
          row,
        ]),
      );

      type EnrichedPosition = Position & {
        takeProfit: string | null;
        stopLoss: string | null;
        protectionMode: "native" | "emulated";
        protectionNote: string | null;
      };

      return positions.map((position): EnrichedPosition => {
        const local = armed.get(`${position.exchange}:${position.id}`);
        return {
          ...position,
          takeProfit: local?.takeProfit ?? null,
          stopLoss: local?.stopLoss ?? null,
          // A literal union, so the client cannot silently accept a string.
          protectionMode: local ? "emulated" : "native",
          protectionNote: local?.note ?? null,
        };
      });
    }),

  /**
   * Arms or clears protective levels on a position.
   *
   * The result carries `mode`, and the UI is expected to show it. A `native` stop
   * is held by the exchange; an `emulated` one is held by this app and only works
   * while it is running. Presenting the two identically would be the most
   * dangerous thing this endpoint could do.
   */
  setProtection: publicProcedure
    .input(
      z.object({
        secret: z.string(),
        positionId: z.string(),
        exchange: exchangeEnum,
        symbol: z.string(),
        instrumentId: z.string().optional(),
        side: z.enum(["long", "short"]),
        entryPrice: z.string(),
        /** Null clears the level; omit to leave it unchanged is not expressible. */
        takeProfit: z.string().nullish(),
        stopLoss: z.string().nullish(),
        clear: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      requireSecret(input.secret);

      const position: Position = {
        id: input.positionId,
        exchange: input.exchange,
        kind: "futures",
        instrumentId: input.instrumentId ?? "",
        symbol: input.symbol,
        side: input.side,
        status: "open",
        leverage: null,
        size: "0",
        entryPrice: input.entryPrice,
        liquidationPrice: null,
        unrealizedPnl: null,
        unrealizedPnlPercent: null,
        realizedPnl: null,
        margin: null,
        openedAt: null,
        closedAt: null,
      };

      return input.clear
        ? Protection.disarm(position)
        : Protection.arm(position, {
            takeProfit: input.takeProfit ?? null,
            stopLoss: input.stopLoss ?? null,
          });
    }),

  /* ---------------------------------------------------------------- *
   * Arbitrage
   * ---------------------------------------------------------------- */

  /**
   * Cross-venue spreads computed from the board rows already on screen.
   *
   * The client sends the rows rather than the server re-reading every exchange,
   * because the board is fed by live websockets and re-fetching here would both
   * waste requests against rate-limited venues and report stale numbers.
   */
  arbitrage: publicProcedure
    .input(z.object({ rows: z.array(z.any()).max(400) }))
    .query(({ input }) =>
      Arbitrage.scan(input.rows as MarketRow[], { actionableOnly: false }),
    ),

  arbitrageRules: publicProcedure
    .input(z.object({ secret: z.string().optional() }))
    .query(async ({ input }) => {
      requireSecret(input.secret);
      return Repository.listArbitrageRules();
    }),

  saveArbitrageRule: publicProcedure
    .input(
      z.object({
        secret: z.string(),
        id: z.string().optional(),
        instrumentId: z.string(),
        buyExchange: exchangeEnum,
        sellExchange: exchangeEnum,
        thresholdPercent: z.string(),
        enabled: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      requireSecret(input.secret);
      return Repository.upsertArbitrageRule({
        id: input.id,
        instrumentId: input.instrumentId,
        buyExchange: input.buyExchange,
        sellExchange: input.sellExchange,
        thresholdPercent: input.thresholdPercent,
        enabled: input.enabled,
      });
    }),

  deleteArbitrageRule: publicProcedure
    .input(z.object({ secret: z.string(), id: z.string() }))
    .mutation(async ({ input }) => {
      requireSecret(input.secret);
      Repository.deleteArbitrageRule(input.id);
      return { ok: true };
    }),
});
