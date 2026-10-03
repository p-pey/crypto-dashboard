import "server-only";

import type { AxiosService } from "~/lib/axios";
import {
  venueNumber,
  type PerpVenueAdapter,
  type PerpVenueQuote,
} from "../venue.port";

const INFO = "https://api.hyperliquid.xyz/info";

/**
 * The cheapest perps venue in the world to read, by a wide margin.
 *
 * One POST returns every listed perp — funding, open interest, mark price and
 * 24h notional for 178 coins at once. For a cross-venue matrix this is the
 * difference between one request and eight, which is why it leads the adapter
 * list despite being the newest venue of the seven.
 *
 * Three unit differences from the rest of the world, all normalised here:
 *
 * - `openInterest` is **base-currency amount**, not contracts and not USD.
 * - `funding` is **hourly**, not the 8-hourly rate every other venue quotes.
 *   Comparing it to an 8h rate without multiplying by eight would show
 *   Hyperliquid as a quarter of the market.
 * - Delisted coins stay in the universe with `isDelisted`, and their asset
 *   context is frozen at the delisting price. Including them would report
 *   billions of open interest in coins nobody can trade.
 */
export class HyperliquidAdapter implements PerpVenueAdapter {
  readonly id = "hyperliquid" as const;
  readonly label = "Hyperliquid";
  readonly supportsLiquidations = false;

  constructor(private readonly http: AxiosService) {}

  async fetchPerps(symbols: string[]): Promise<PerpVenueQuote[]> {
    const { data } = await this.http.post<HyperliquidResponse>(
      INFO,
      { type: "metaAndAssetCtxs" },
      { timeout: 10_000, headers: { Accept: "application/json" } },
    );

    const universe = data?.[0]?.universe ?? [];
    const contexts = data?.[1] ?? [];

    // Uppercased for the join key, since the venue reports symbols uppercased
    // already but a caller filter will not be.
    const wanted = new Set(symbols.map((symbol) => symbol.toUpperCase()));
    const quotes: PerpVenueQuote[] = [];

    for (const [index, asset] of universe.entries()) {
      const symbol = asset?.name?.toUpperCase();
      if (!symbol || asset.isDelisted) continue;
      // An empty filter means "everything", which is the whole point of this
      // venue: the request is already paid for.
      if (wanted.size > 0 && !wanted.has(symbol)) continue;

      const ctx = contexts[index];
      if (!ctx) continue;

      const markPrice = venueNumber(ctx.markPx);
      const openInterest = venueNumber(ctx.openInterest);

      quotes.push({
        venue: this.id,
        instrument: symbol,
        symbol,
        markPrice,
        indexPrice: venueNumber(ctx.oraclePx) ?? venueNumber(ctx.midPx),
        openInterestContracts: openInterest,
        // No price means no conversion, and inventing a dollar figure from a
        // stale mark is worse than reporting the coin amount alone.
        openInterestUsd:
          openInterest === null || markPrice === null
            ? null
            : openInterest * markPrice,
        volume24hUsd: venueNumber(ctx.dayNtlVlm),
        fundingRate: venueNumber(ctx.funding),
        fundingIntervalHours: 1,
        nextFundingAt: null,
        longShortAccountRatio: null,
        takerBuySellRatio: null,
      });
    }

    return quotes;
  }

  /**
   * Hyperliquid does not publish a liquidation feed.
   *
   * Deliberately unimplemented rather than approximated: the venue zeroes a
   * position on its own risk engine and never tells the market about it, so
   * there is nothing to read. Deriving a figure here would be inventing one.
   */
  async fetchLiquidations(): Promise<never[]> {
    throw new Error("Hyperliquid publishes no liquidation feed");
  }
}

type HyperliquidAsset = {
  name?: string;
  isDelisted?: boolean;
};

type HyperliquidContext = {
  funding?: string;
  openInterest?: string;
  markPx?: string;
  oraclePx?: string;
  midPx?: string;
  dayNtlVlm?: string;
};

type HyperliquidResponse = [
  { universe?: HyperliquidAsset[] } | undefined,
  HyperliquidContext[] | undefined,
];
