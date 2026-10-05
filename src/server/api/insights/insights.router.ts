import { z } from "zod";

import { AppContainer } from "~/lib/container";
import CategoriesService from "~/services/categories/CategoriesService";
import DefiService from "~/services/defi/DefiService";
import DexService, { type DexTimeframe } from "~/services/dex/DexService";
import MacroSeriesService from "~/services/macro/MacroSeriesService";
import OnchainService from "~/services/onchain/OnchainService";
import PredictionService from "~/services/prediction/PredictionService";
import PriceCrossCheckService, {
  type PrimaryPrice,
} from "~/services/prices/PriceCrossCheckService";
import TokenSafetyService from "~/services/safety/TokenSafetyService";
import { createTRPCRouter, publicProcedure } from "../trpc";

const Defi = AppContainer.resolve(DefiService);
const Categories = AppContainer.resolve(CategoriesService);
const Safety = AppContainer.resolve(TokenSafetyService);
const Dex = AppContainer.resolve(DexService);
const Onchain = AppContainer.resolve(OnchainService);
const Prediction = AppContainer.resolve(PredictionService);
const CrossCheck = AppContainer.resolve(PriceCrossCheckService);
const MacroSeries = AppContainer.resolve(MacroSeriesService);

/**
 * Everything `docs/feature-catalog.md` found that is free and reachable.
 *
 * One router rather than eight because they share one property the app cares
 * about: **every procedure here reads from a free public source and writes
 * nothing.** There is no database in this app and none is introduced by any of
 * these features — a restart costs one re-fetch per source and nothing else, and
 * every source is cached far longer than that takes to notice.
 *
 * The procedures are separated rather than merged so that each degrades on its
 * own. A panel asking for DEX pools must not be blocked by a stablecoin feed
 * being slow, and every one of these returns its own `stale`/`error` so the UI
 * can name which source failed instead of rendering a partial answer as complete.
 */

/** A contract address. Bounded here because the value reaches a URL. */
const address = z
  .string()
  .trim()
  .min(20, "address is too short")
  .max(90, "address is too long")
  .regex(/^[a-zA-Z0-9]+$/, "address has unexpected characters");

/** GeckoTerminal's supported bucket widths, kept off the wire as free strings. */
const timeframe = z.enum(["minute", "hour", "day", "week"]);

/** A search query. Bounded because it is interpolated into a DexScreener path. */
const searchQuery = z
  .string()
  .trim()
  .min(1)
  .max(24, "query is too long")
  .regex(/^[a-zA-Z0-9$.\-:]+$/, "query has unexpected characters");

export const insightsRouter = createTRPCRouter({
  // ---------------------------------------------------------------- //
  // Sector rotation
  // ---------------------------------------------------------------- //

  /**
   * Categories ranked by 24h change.
   *
   * This retires the documented dependency on a CoinMarketCap Pro key: the free
   * CoinGecko category endpoint carries the same market-cap-change figure, so the
   * rotation board works with no credential at all.
   */
  categories: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(120).optional(),
          force: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ input }) => Categories.getSnapshot(input ?? {})),

  // ---------------------------------------------------------------- //
  // DeFi, from DefiLlama
  // ---------------------------------------------------------------- //

  /** Protocol TVL, with TVL-to-market-cap and chain concentration. */
  protocols: publicProcedure
    .input(
      z
        .object({
          category: z.string().trim().max(40).optional(),
          limit: z.number().int().min(1).max(200).optional(),
          force: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ input }) => Defi.getProtocols(input ?? {})),

  /**
   * Fees and revenue as two separate columns.
   *
   * Gross fees are what users paid and revenue is what the protocol kept; a
   * market-making DEX legitimately keeps a fraction of what it collects, so the
   * take rate is reported rather than implying revenue equals fees.
   */
  fees: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .query(({ input }) => Defi.getFees(input ?? {})),

  /** DEX volume by venue. */
  dexVolume: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .query(({ input }) => Defi.getDexVolume(input ?? {})),

  /** Chain TVL, ranked. */
  chains: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).optional(),
          force: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ input }) => Defi.getChains(input ?? {})),

  /**
   * Stablecoin supply per asset and per chain.
   *
   * A leading liquidity indicator rather than a lagging one, which is why it
   * reads as an expansion/contraction series rather than as a price.
   */
  stablecoins: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .query(({ input }) => Defi.getStablecoins(input ?? {})),

  /** Exchange reserves, from the venues' own published figures. */
  cexReserves: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(60).optional(),
          force: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ input }) => Defi.getCexReserves(input ?? {})),

  /**
   * Exploit history, losses net of returned funds.
   *
   * The raw loss a protocol took is the figure a risk score should use: an
   * exploit that stole $40M and returned $30M cost $10M.
   */
  hacks: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).optional(),
          force: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ input }) => Defi.getHacks(input ?? {})),

  // ---------------------------------------------------------------- //
  // Token safety
  // ---------------------------------------------------------------- //

  /**
   * Honeypot, tax and owner-privilege check, from two independent free checkers.
   *
   * The chain is resolved from the address's own shape rather than trusted from
   * the request, because a safety check that silently ran against the wrong chain
   * is worse than no check at all. Where the two checkers disagree the token is
   * flagged rather than cleared — taking the optimistic reading of a disagreement
   * is the exact failure this feature exists to prevent.
   */
  tokenSafety: publicProcedure
    .input(
      z.object({
        address,
        chain: z.string().trim().max(20).optional(),
        force: z.boolean().optional(),
      }),
    )
    .query(({ input }) => Safety.check(input)),

  // ---------------------------------------------------------------- //
  // DEX
  // ---------------------------------------------------------------- //

  /** The busiest pools across the deepest quote pairs. */
  dexBoard: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).optional(),
          force: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ input }) => Dex.getBoard(input ?? {})),

  /**
   * Search a token and price its pools against each other.
   *
   * One request returns every pool quoting the token, so the arbitrage table is
   * arithmetic over data already fetched — no credentials, no order-book plumbing.
   */
  dexSearch: publicProcedure
    .input(
      z.object({
        query: searchQuery,
        limit: z.number().int().min(1).max(60).optional(),
        force: z.boolean().optional(),
      }),
    )
    .query(({ input }) => Dex.search(input.query, input)),

  /** Per-pool candles. `network` is a GeckoTerminal slug from `dexNetworks`. */
  dexCandles: publicProcedure
    .input(
      z.object({
        network: z.string().trim().min(2).max(40),
        pool: z.string().trim().min(10).max(90).regex(/^[a-zA-Z0-9]+$/),
        timeframe: timeframe.default("hour"),
        force: z.boolean().optional(),
      }),
    )
    .query(({ input }) =>
      Dex.getCandles(
        input.network,
        input.pool,
        input.timeframe as DexTimeframe,
        input,
      ),
    ),

  /** Chains GeckoTerminal indexes, needed to request candles. */
  dexNetworks: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .query(({ input }) => Dex.getNetworks(input ?? {})),

  // ---------------------------------------------------------------- //
  // On-chain
  // ---------------------------------------------------------------- //

  /**
   * Chain network health across Blockscout, Blockchair, mempool.space and Solana
   * RPC — all keyless, each settled independently.
   */
  chainNetwork: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .query(({ input }) => Onchain.getNetworkReport(input ?? {})),

  /**
   * Top token holders, via Etherscan V2.
   *
   * The one keyed path in the new features. Unset, this reports
   * `configured: false` and nothing else changes — which is why it is a
   * conditional inside the response rather than a guard on the whole router.
   */
  tokenHolders: publicProcedure
    .input(
      z.object({
        address,
        chainId: z.number().int().min(1).max(999_999),
        force: z.boolean().optional(),
      }),
    )
    .query(({ input }) => Onchain.getHolders(input, input)),

  // ---------------------------------------------------------------- //
  // Prediction markets
  // ---------------------------------------------------------------- //

  /**
   * Live money-backed probabilities from Polymarket.
   *
   * Filtered to crypto-relevant markets, because Polymarket's highest-volume
   * markets are elections and geopolitics and an unfiltered list would push the
   * panel off-topic immediately.
   */
  predictionMarkets: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .query(({ input }) => Prediction.getSnapshot(input ?? {})),

  // ---------------------------------------------------------------- //
  // Independent price cross-check
  // ---------------------------------------------------------------- //

  /**
   * CoinPaprika's independent index, plus the exchange ranking that
   * CoinMarketCap Pro would otherwise charge for.
   */
  alternativePrices: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).optional(),
          force: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ input }) => CrossCheck.getTickers(input ?? {})),

  /**
   * Compare the app's own prices against CoinPaprika's.
   *
   * Every other price in the app comes from CoinGecko or an exchange, and a
   * single source cannot reveal its own error. This is the check that a wrong
   * figure is visible rather than merely absent.
   */
  priceDivergence: publicProcedure
    .input(
      z
        .object({
          prices: z
            .array(
              z.object({
                symbol: z.string().trim().min(1).max(12),
                usd: z.number().positive().nullable(),
              }),
            )
            .max(120),
          force: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ input }) => CrossCheck.compare((input?.prices ?? []) as PrimaryPrice[], input ?? {})),

  // ---------------------------------------------------------------- //
  // Macro
  // ---------------------------------------------------------------- //

  /** ECB reference FX rates plus World Bank CPI. */
  macroSeries: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .query(({ input }) => MacroSeries.getReport(input ?? {})),
});