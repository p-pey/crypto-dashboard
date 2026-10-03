import "server-only";

import type { AxiosService } from "~/lib/axios";
import {
  venueIntervalHours,
  venueNumber,
  type PerpVenueAdapter,
  type PerpVenueQuote,
} from "../venue.port";

const MIX = "https://api.bitget.com/api/v2/mix/market";

/**
 * Quote currencies Bitget settles mix markets in.
 *
 * Read off the symbol rather than fetched from a contract endpoint: the ticker
 * payload is 800-odd rows and a second round trip just to learn a coin's
 * ticker is the single most expensive way to answer this.
 */
const QUOTE_SUFFIXES = ["USDT", "USDC", "USD", "COIN"];

/**
 * Bitget's whole perps board, in two requests.
 *
 * `/tickers` is the useful one: it carries funding rate, open interest
 * (`holdingAmount`, in base coin), mark price, index price and 24h notional for
 * every listed contract. That is the entire cross-venue matrix in one payload,
 * which no other venue except Hyperliquid manages.
 *
 * `/current-fund-rate` is fetched alongside it purely for the **interval**, and
 * this is why: Bitget settles USDT and COIN perps on different cycles, and a
 * funding rate is meaningless — actively misleading — without the cycle it
 * applies to. Comparing an 8h rate to a 4h rate side by side is a units error
 * that looks exactly like a signal.
 *
 * `holdingAmount` is base-coin open interest, not contracts. Bitget's
 * `open-interest` endpoint returns contracts, which would need a
 * `sizeMultiplier` lookup to convert; the ticker avoids that round trip
 * entirely.
 */
export class BitgetAdapter implements PerpVenueAdapter {
  readonly id = "bitget" as const;
  readonly label = "Bitget";
  readonly supportsLiquidations = false;

  constructor(private readonly http: AxiosService) {}

  async fetchPerps(symbols: string[]): Promise<PerpVenueQuote[]> {
    const productType = "USDT-FUTURES";

    const [tickers, rates] = await Promise.all([
      this.get<BitgetTicker[]>(`${MIX}/tickers?productType=${productType}`),
      // Interval only; a failure here must not cost the whole board, so it
      // falls back to a null interval and the funding row is marked unknown
      // rather than mislabelled as 8h.
      this.get<BitgetFundingRate[]>(
        `${MIX}/current-fund-rate?productType=${productType}`,
      ).catch(() => [] as BitgetFundingRate[]),
    ]);

    const rateBySymbol = new Map(rates.map((rate) => [rate.symbol, rate]));
    const wanted = new Set(symbols.map((symbol) => symbol.toUpperCase()));
    const quotes: PerpVenueQuote[] = [];

    for (const ticker of tickers) {
      const symbol = ticker?.symbol;
      if (!symbol) continue;

      const base = stripQuote(symbol);
      if (!base) continue;
      if (wanted.size > 0 && !wanted.has(base)) continue;

      const markPrice =
        venueNumber(ticker.markPrice) ?? venueNumber(ticker.lastPr);
      const openInterest = venueNumber(ticker.holdingAmount);
      const rate = rateBySymbol.get(symbol);

      quotes.push({
        venue: this.id,
        instrument: symbol,
        symbol: base,
        markPrice,
        indexPrice: venueNumber(ticker.indexPrice),
        openInterestContracts: openInterest,
        openInterestUsd:
          openInterest === null || markPrice === null
            ? null
            : openInterest * markPrice,
        volume24hUsd:
          venueNumber(ticker.usdtVolume) ?? venueNumber(ticker.quoteVolume),
        fundingRate:
          venueNumber(ticker.fundingRate) ?? venueNumber(rate?.fundingRate),
        fundingIntervalHours: venueIntervalHours(rate?.fundingRateInterval),
        nextFundingAt: venueNumber(rate?.nextUpdate),
        longShortAccountRatio: null,
        takerBuySellRatio: null,
      });
    }

    return quotes;
  }

  /**
   * Bitget does not expose a liquidation history over its public API — the
   * documented paths return 404. Its websocket `takerTrade` topic carries
   * liquidations inline and is the route to adding them later, which is why the
   * port allows a venue to answer `false` rather than force a fake feed.
   */
  async fetchLiquidations(): Promise<never[]> {
    throw new Error("Bitget publishes no liquidation history over REST");
  }

  private async get<T>(url: string): Promise<T> {
    const { data } = await this.http.get<BitgetEnvelope<T>>(url, {
      timeout: 10_000,
      headers: { Accept: "application/json" },
    });
    // Bitget answers 200 with an application-level error code, so the envelope
    // has to be unwrapped or every failure looks like an empty board.
    const code = data?.code;
    if (typeof code === "string" && code !== "00000") {
      throw new Error(`Bitget said ${code}: ${data?.msg ?? "unknown"}`);
    }
    return (data?.data ?? []) as T;
  }
}

/** `BTCUSDT` → `BTC`. Null when the symbol carries no known quote suffix. */
function stripQuote(symbol: string): string | null {
  for (const suffix of QUOTE_SUFFIXES) {
    if (symbol.length > suffix.length && symbol.endsWith(suffix)) {
      return symbol.slice(0, -suffix.length);
    }
  }
  return null;
}

type BitgetEnvelope<T> = { code?: string; msg?: string; data?: T };

type BitgetTicker = {
  symbol?: string;
  lastPr?: string;
  markPrice?: string;
  indexPrice?: string;
  fundingRate?: string;
  holdingAmount?: string;
  usdtVolume?: string;
  quoteVolume?: string;
};

type BitgetFundingRate = {
  symbol?: string;
  fundingRate?: string;
  fundingRateInterval?: string;
  nextUpdate?: string;
};
