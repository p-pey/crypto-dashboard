import "server-only";

import type { AxiosService } from "~/lib/axios";
import {
  venueNumber,
  type PerpVenueAdapter,
  type PerpVenueQuote,
} from "../venue.port";

const V5 = "https://api.bybit.com/v5/market";

/**
 * Bybit in one request.
 *
 * `/v5/market/tickers?category=linear` is the whole linear board, and unlike
 * Binance it reports **open interest value in USD directly** (`openInterestValue`)
 * alongside the base-coin figure — so no conversion, and no dependence on a mark
 * price being present to turn contracts into notional.
 *
 * Liquidations are the interesting part and the disappointing one. Bybit has no
 * REST history for forced closes; the only publication is the websocket topic
 * `allLiquidation.{symbol}`, which pushes and keeps nothing. A REST poll of this
 * adapter would therefore return an empty tape and imply a calm market during
 * exactly the cascade it exists to reveal — so the port asks the question up
 * front and this adapter answers `false`.
 */
export class BybitAdapter implements PerpVenueAdapter {
  readonly id = "bybit" as const;
  readonly label = "Bybit";
  readonly supportsLiquidations = false;

  constructor(private readonly http: AxiosService) {}

  async fetchPerps(symbols: string[]): Promise<PerpVenueQuote[]> {
    const { data } = await this.http.get<BybitEnvelope<BybitTicker>>(
      `${V5}/tickers?category=linear`,
      { timeout: 10_000, headers: { Accept: "application/json" } },
    );

    // Bybit answers HTTP 200 with a non-zero retCode for business failures.
    if (data?.retCode !== 0) {
      throw new Error(
        `Bybit said ${data?.retCode}: ${data?.retMsg ?? "unknown"}`,
      );
    }

    const wanted = new Set(symbols.map((symbol) => symbol.toUpperCase()));
    const quotes: PerpVenueQuote[] = [];

    for (const ticker of data?.result?.list ?? []) {
      const symbol = ticker?.symbol;
      if (!symbol) continue;

      // Linear perps are `<COIN>USDT`; the inverse contracts are `<COIN>USD`
      // and are excluded because their payout is in coin, not dollars, which
      // makes an open-interest column that adds them up meaningless.
      if (!symbol.endsWith("USDT")) continue;
      const coin = symbol.slice(0, -"USDT".length);
      if (wanted.size > 0 && !wanted.has(coin)) continue;

      const openInterest = venueNumber(ticker.openInterest);

      quotes.push({
        venue: this.id,
        instrument: symbol,
        symbol: coin,
        markPrice: venueNumber(ticker.markPrice),
        indexPrice: venueNumber(ticker.indexPrice),
        openInterestContracts: openInterest,
        openInterestUsd: venueNumber(ticker.openInterestValue),
        volume24hUsd: venueNumber(ticker.turnover24h),
        fundingRate: venueNumber(ticker.fundingRate),
        // Bybit's own field, and the reason a guess would be a bug: it is not
        // always 8, and the board publishes it per contract. The field is named
        // `fundingIntervalHour` — singular, no `s` — and reading it as
        // `fundingInterval` returns undefined, which silently drops Bybit from
        // every weighted funding average on the board.
        fundingIntervalHours: venueNumber(ticker.fundingIntervalHour),
        nextFundingAt: venueNumber(ticker.nextFundingTime),
        longShortAccountRatio: null,
        takerBuySellRatio: null,
      });
    }

    return quotes;
  }

  /**
   * Websocket-only. See the class note — an empty REST result here would be a
   * lie told at the worst possible moment.
   */
  async fetchLiquidations(): Promise<never[]> {
    throw new Error("Bybit streams liquidations over websocket only");
  }
}

type BybitEnvelope<T> = {
  retCode?: number;
  retMsg?: string;
  result?: { list?: T[] } | null;
};

type BybitTicker = {
  symbol?: string;
  markPrice?: string;
  indexPrice?: string;
  fundingRate?: string;
  fundingIntervalHour?: string;
  nextFundingTime?: string;
  openInterest?: string;
  openInterestValue?: string;
  turnover24h?: string;
};
