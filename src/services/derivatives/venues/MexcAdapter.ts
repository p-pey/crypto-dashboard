import "server-only";

import type { AxiosService } from "~/lib/axios";
import {
  venueNumber,
  type PerpVenueAdapter,
  type PerpVenueQuote,
} from "../venue.port";

const MEXC = "https://contract.mexc.com/api/v1";

/**
 * MEXC has no batch endpoint, so this adapter is the expensive one.
 *
 * Funding requires a per-symbol call and contract size requires a per-symbol
 * call, meaning N coins costs 2N requests. It is capped rather than left open
 * because the alternative is a refresh that trips MEXC's rate limit and gets the
 * *whole board* throttled — one expensive venue must not be able to degrade the
 * four cheap ones.
 *
 * That cap is why MEXC reports funding and price for the coins at the top of the
 * list and open interest for as many as the budget allows. The venue report says
 * so, rather than the matrix silently showing a shorter column for this row than
 * for the others.
 *
 * MEXC sits behind an edge WAF that blocks `open_interest` outright from some
 * regions, so the notional degrades to null there — which is why the conversion
 * below is written against the fair price the funding response already carries,
 * not against a separate price request.
 */
export class MexcAdapter implements PerpVenueAdapter {
  readonly id = "mexc" as const;
  readonly label = "MEXC";
  readonly supportsLiquidations = false;

  /** Per-symbol endpoints mean this adapter is bounded rather than exhaustive. */
  static readonly MAX_SYMBOLS = 4;

  constructor(private readonly http: AxiosService) {}

  async fetchPerps(symbols: string[]): Promise<PerpVenueQuote[]> {
    const coins = symbols
      .map((symbol) => symbol.toUpperCase())
      .filter((symbol) => /^[A-Z0-9]{2,20}$/.test(symbol))
      .slice(0, MexcAdapter.MAX_SYMBOLS);

    const quotes: PerpVenueQuote[] = [];

    for (const coin of coins) {
      const symbol = `${coin}_USDT`;

      const [detail, funding] = await Promise.all([
        this.mexc<MexcDetail>(`${MEXC}/contract/detail?symbol=${symbol}`).catch(
          () => null,
        ),
        this.mexc<MexcFunding>(`${MEXC}/contract/funding_rate/${symbol}`).catch(
          () => null,
        ),
      ]);

      // `state: 0` is open for trading; anything else is delisted or halted, and
      // its funding rate is frozen at the last print rather than being current.
      if (detail?.state !== 0) continue;

      // MEXC has no batch open interest and its per-symbol endpoint is
      // WAF-blocked in some regions, so this is best-effort by design.
      const holdAmount = await this.mexc<{ holdAmt?: number }>(
        `${MEXC}/contract/open_interest/${symbol}`,
      )
        .then((data) => venueNumber(data?.holdAmt))
        .catch(() => null);

      const price =
        venueNumber(funding?.fairPrice) ?? venueNumber(funding?.idxPrice);

      quotes.push({
        venue: this.id,
        instrument: symbol,
        symbol: detail.baseCoin?.toUpperCase() ?? coin,
        markPrice: price,
        indexPrice: venueNumber(funding?.idxPrice),
        openInterestContracts: holdAmount,
        openInterestUsd:
          holdAmount !== null && price !== null ? holdAmount * price : null,
        volume24hUsd: null,
        fundingRate: venueNumber(funding?.fundingRate),
        // MEXC publishes the cycle directly rather than assuming 8h.
        fundingIntervalHours: venueNumber(funding?.collectCycle),
        nextFundingAt: venueNumber(funding?.nextSettleTime),
        longShortAccountRatio: null,
        takerBuySellRatio: null,
      });
    }

    return quotes;
  }

  /**
   * MEXC's liquidation history endpoint answers 403 at the edge from most
   * regions, and its websocket force-order topic is not documented. No figure
   * is invented in its place.
   */
  async fetchLiquidations(): Promise<never[]> {
    throw new Error("MEXC does not publish a liquidation feed");
  }

  private async mexc<T>(url: string): Promise<T> {
    const { data } = await this.http.get<MexcEnvelope<T>>(url, {
      timeout: 10_000,
      headers: { Accept: "application/json" },
    });
    // MEXC answers HTTP 200 with `success: false` on business failures.
    if (data?.success === false) {
      throw new Error(`MEXC said ${data?.code}: ${data?.message ?? "unknown"}`);
    }
    return (data?.data ?? null) as T;
  }
}

type MexcEnvelope<T> = {
  success?: boolean;
  code?: number;
  message?: string;
  data?: T;
};

type MexcDetail = { baseCoin?: string; contractSize?: number; state?: number };

type MexcFunding = {
  fundingRate?: number;
  collectCycle?: number;
  nextSettleTime?: number;
  idxPrice?: number;
  fairPrice?: number;
};
