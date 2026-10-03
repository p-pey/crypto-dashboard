import "server-only";

import type { AxiosService } from "~/lib/axios";
import {
  venueIntervalHours,
  venueNumber,
  type LiquidationPrint,
  type PerpVenueAdapter,
  type PerpVenueQuote,
} from "../venue.port";

const FAPI = "https://fapi.binance.com";

/** A forced order book returns up to this many prints, and 1000 is the cap. */
const LIQUIDATION_LIMIT = 1000;

/**
 * The largest derivatives venue there is, and the one with the most useful
 * public endpoint: `/fapi/v1/allForceOrders` is a **complete** liquidation
 * tape, no key, no subscription, no polling licence.
 *
 * That is what makes the free version of the CoinGlass liquidation panel
 * possible at all: this single feed is the reason it is worth writing.
 *
 * Two things about reading it correctly:
 *
 * - **`side` is the aggressor, so the liquidated side is its opposite.** A SELL
 *   force-order means a long was closed. Reading `side` as the liquidated side
 *   inverts the long/short split, which is the one figure a reader trusts
 *   immediately — so it is the one that must not be wrong.
 * - **The board is empty when nothing was liquidated, which is a real answer.**
 *   Unlike the other venues here, this one is authoritative, so a quiet screen
 *   means a quiet market rather than a blocked feed.
 */
export class BinanceAdapter implements PerpVenueAdapter {
  readonly id = "binance" as const;
  readonly label = "Binance Futures";
  readonly supportsLiquidations = true;

  constructor(private readonly http: AxiosService) {}

  async fetchPerps(symbols: string[]): Promise<PerpVenueQuote[]> {
    const wanted = symbols
      .map((symbol) => symbol.toUpperCase())
      .filter((symbol) => /^[A-Z0-9]{4,20}$/.test(symbol));

    // One call for every mark price, index price, funding rate and settlement
    // time on the board. Open interest has no batch equivalent, so it is the
    // only reason this is N+1 requests.
    const { data: board } = await this.http.get<BinancePremiumIndex[]>(
      `${FAPI}/fapi/v1/premiumIndex`,
      { timeout: 10_000, headers: { Accept: "application/json" } },
    );

    const bySymbol = new Map((board ?? []).map((row) => [row.symbol, row]));
    const quotes: PerpVenueQuote[] = [];

    for (const symbol of wanted) {
      const row = bySymbol.get(symbol);
      if (!row) continue;

      const markPrice = venueNumber(row.markPrice);

      // No batch endpoints for any of these three, so they are fetched per coin
      // and each is allowed to fail alone: one rate-limited figure costs its own
      // cell rather than the whole venue's row.
      const [openInterest, positioning] = await Promise.all([
        this.openInterest(symbol),
        this.positioning(symbol),
      ]);

      quotes.push({
        venue: this.id,
        instrument: symbol,
        symbol,
        markPrice,
        indexPrice: venueNumber(row.indexPrice),
        openInterestContracts: openInterest,
        openInterestUsd:
          openInterest === null || markPrice === null
            ? null
            : openInterest * markPrice,
        // `/premiumIndex` carries no volume, and the 24h ticker board is a
        // second full-board fetch for one field; leaving it null keeps the
        // panel honest instead of paying a whole request per refresh.
        volume24hUsd: null,
        fundingRate: venueNumber(row.lastFundingRate),
        fundingIntervalHours: venueIntervalHours(8),
        nextFundingAt: venueNumber(row.nextFundingTime),
        longShortAccountRatio: positioning.longShort,
        takerBuySellRatio: positioning.taker,
      });
    }

    return quotes;
  }

  async fetchLiquidations(symbols: string[]): Promise<LiquidationPrint[]> {
    const wanted = symbols
      .map((symbol) => symbol.toUpperCase())
      .filter((symbol) => /^[A-Z0-9]{4,20}$/.test(symbol));

    const prints: LiquidationPrint[] = [];
    for (const symbol of wanted) {
      const { data } = await this.http.get<BinanceForceOrder[]>(
        `${FAPI}/fapi/v1/allForceOrders` +
          `?symbol=${symbol}&limit=${LIQUIDATION_LIMIT}`,
        { timeout: 10_000, headers: { Accept: "application/json" } },
      );

      for (const order of data ?? []) {
        const price = venueNumber(order.avgPrice) ?? venueNumber(order.price);
        const quantity =
          venueNumber(order.executedQty) ?? venueNumber(order.origQty);
        const notional = venueNumber(order.cumQuote);

        prints.push({
          venue: this.id,
          symbol,
          // The aggressor sold, so the position closed was a long.
          side: order.side === "SELL" ? "long" : "short",
          price,
          quantity,
          usd:
            notional ??
            (price !== null && quantity !== null ? price * quantity : null),
          timestamp: venueNumber(order.time) ?? Date.now(),
        });
      }
    }

    return prints.sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Open interest in base currency, or null when this coin's call fails. */
  private async openInterest(symbol: string): Promise<number | null> {
    try {
      const { data } = await this.http.get<BinanceOpenInterest>(
        `${FAPI}/fapi/v1/openInterest?symbol=${symbol}`,
        { timeout: 10_000, headers: { Accept: "application/json" } },
      );
      return venueNumber(data?.openInterest);
    } catch {
      return null;
    }
  }

  /**
   * Long/short and taker flow ratios for one coin.
   *
   * Binance is the only venue of the seven that publishes both over REST, and
   * they answer different questions: the account ratio counts **retail-sized
   * accounts**, while the taker ratio measures **aggressive flow** — the ratio
   * actually taking risk. They disagree often, and that disagreement is one of
   * the more reliable things on a derivatives screen: accounts leaning long
   * while takers sell is distribution.
   *
   * Returns nulls rather than throwing, because a panel with one missing ratio
   * is more useful than no row.
   */
  private async positioning(
    symbol: string,
  ): Promise<{ longShort: number | null; taker: number | null }> {
    const read = async (path: string): Promise<number | null> => {
      try {
        const { data } = await this.http.get<BinanceRatioRow[]>(
          `${FAPI}/futures/data/${path}?symbol=${symbol}&period=5m&limit=1`,
          { timeout: 10_000, headers: { Accept: "application/json" } },
        );
        const row = data?.[0];
        if (!row) return null;
        // `globalLongShortAccountRatio` reports `longShortRatio` directly;
        // `takerlongshortRatio` reports both legs and needs dividing.
        if (typeof row.longShortRatio === "string") {
          return venueNumber(row.longShortRatio);
        }
        const buy = venueNumber(row.buyVol);
        const sell = venueNumber(row.sellVol);
        return buy !== null && sell !== null && sell !== 0 ? buy / sell : null;
      } catch {
        return null;
      }
    };

    const [longShort, taker] = await Promise.all([
      read("globalLongShortAccountRatio"),
      read("takerlongshortRatio"),
    ]);
    return { longShort, taker };
  }
}

type BinancePremiumIndex = {
  symbol?: string;
  markPrice?: string;
  indexPrice?: string;
  lastFundingRate?: string;
  nextFundingTime?: number;
};

type BinanceOpenInterest = { openInterest?: string };

type BinanceRatioRow = {
  longShortRatio?: string;
  buyVol?: string;
  sellVol?: string;
};

type BinanceForceOrder = {
  symbol?: string;
  side?: string;
  price?: string;
  avgPrice?: string;
  origQty?: string;
  executedQty?: string;
  cumQuote?: string;
  time?: number;
};
