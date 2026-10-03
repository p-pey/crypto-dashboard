import "server-only";

import type { AxiosService } from "~/lib/axios";
import {
  venueNumber,
  type PerpVenueAdapter,
  type PerpVenueQuote,
} from "../venue.port";

const DERIBIT = "https://www.deribit.com/api/v2/public";

/**
 * Deribit, for the perps matrix.
 *
 * Kept separate from `DerivativesService` on purpose. That service is the
 * *options* reader and its whole design is about a single currency's expiry
 * ladder; this one is the *cross-venue perps* reader and its whole design is
 * about comparing the same coin across exchanges. Merging them would have made
 * one file that caches two unrelated TTLs.
 *
 * `get_book_summary_by_currency` refuses `currency=any`, so this is one request
 * per coin — the reason it is not the venue that leads the board, despite being
 * the one that answers from everywhere.
 *
 * Two things worth stating because they are easy to get wrong:
 *
 * - **A perpetual is a two-part instrument name.** `BTC-PERPETUAL` splits into
 *   two segments; a length check that only accepts four silently drops the entire
 *   perps list and returns an empty board that looks like a quiet market.
 * - **Perpetual open interest is already in USD.** The option rows on the same
 *   endpoint are in base currency, so the same field means different things two
 *   lines apart. The options reader documents the same trap.
 */
export class DeribitAdapter implements PerpVenueAdapter {
  readonly id = "deribit" as const;
  readonly label = "Deribit";
  readonly supportsLiquidations = false;

  constructor(private readonly http: AxiosService) {}

  async fetchPerps(symbols: string[]): Promise<PerpVenueQuote[]> {
    const coins = symbols
      .map((symbol) => symbol.toUpperCase())
      .filter((symbol) => /^[A-Z0-9]{2,20}$/.test(symbol));

    const quotes: PerpVenueQuote[] = [];

    for (const coin of coins) {
      const { data } = await this.http.get<{ result?: DeribitRow[] }>(
        `${DERIBIT}/get_book_summary_by_currency?currency=${coin}&kind=future`,
        { timeout: 10_000, headers: { Accept: "application/json" } },
      );

      // Two books exist for most coins: `{COIN}-PERPETUAL` is inverse and
      // coin-settled, `{COIN}_USDC-PERPETUAL` is linear and dollar-settled. Only
      // the linear one belongs in a column labelled dollars, so the inverse is
      // used only where no linear book exists (BTC, ETH).
      const rows = data?.result ?? [];
      const linear = rows.find(
        (row) => row.instrument_name === `${coin}_USDC-PERPETUAL`,
      );
      const inverse = rows.find(
        (row) => row.instrument_name === `${coin}-PERPETUAL`,
      );
      const row = linear ?? inverse;
      if (!row) continue;

      const markPrice = venueNumber(row.mark_price);

      quotes.push({
        venue: this.id,
        instrument: row.instrument_name ?? "",
        symbol: coin,
        markPrice,
        indexPrice:
          venueNumber(row.underlying_price) ?? venueNumber(row.index_price),
        // Already USD on this endpoint — no conversion, unlike every other venue.
        openInterestContracts: null,
        openInterestUsd: venueNumber(row.open_interest),
        volume24hUsd: venueNumber(row.volume_usd),
        fundingRate: await this.funding(coin),
        fundingIntervalHours: 8,
        nextFundingAt: null,
        longShortAccountRatio: null,
        takerBuySellRatio: null,
      });
    }

    return quotes;
  }

  /**
   * Deribit has no forced-close feed on the public API. A position crossed here
   * is closed on the venue's own risk engine and never printed.
   */
  async fetchLiquidations(): Promise<never[]> {
    throw new Error("Deribit publishes no liquidation feed");
  }

  /** Current funding as a fraction; null when the coin has no perp settled. */
  private async funding(coin: string): Promise<number | null> {
    const now = Date.now();
    const { data } = await this.http
      .get<{
        result?: { interest_8h?: number }[];
      }>(
        `${DERIBIT}/get_funding_rate_history` +
          `?instrument_name=${coin}-PERPETUAL` +
          `&start_timestamp=${now - 6 * 3_600_000}&end_timestamp=${now}`,
        { timeout: 10_000, headers: { Accept: "application/json" } },
      )
      .catch(() => ({ data: { result: [] as { interest_8h?: number }[] } }));

    const points = data?.result ?? [];
    return points.length > 0 ? venueNumber(points.at(-1)?.interest_8h) : null;
  }
}

type DeribitRow = {
  instrument_name?: string;
  open_interest?: number;
  mark_price?: number;
  underlying_price?: number;
  index_price?: number;
  volume_usd?: number;
};
