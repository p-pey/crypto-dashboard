import "server-only";

import type { AxiosService } from "~/lib/axios";
import {
  venueNumber,
  type LiquidationPrint,
  type PerpVenueAdapter,
  type PerpVenueQuote,
} from "../venue.port";

const OKX = "https://www.okx.com/api/v5";

/**
 * The only venue besides Binance that publishes a liquidations history over
 * plain REST, and the richest of the two in what it includes: every print
 * carries the **bankruptcy price** (`bkPx`), which is the price the venue
 * actually closed the position at rather than the taker's fill price. Reading
 * that difference is how a cascade is told apart from an ordinary selloff.
 *
 * Everything here is denominated in **contracts**, not coins, and the contract
 * size differs per instrument — `BTC-USDT-SWAP` is 0.01 BTC while most alts are
 * 1. So `/public/instruments` is fetched first and its `ctVal` is what turns a
 * size into a notional. Skipping it and treating `sz` as coins would overstate
 * every alt's liquidation by orders of magnitude.
 *
 * Also note OKX settles in three quote currencies (`USDT`, `USDC`, coin-margined)
 * and the coin-margined books are denominated in the coin itself, so only the
 * two dollar books are read: adding a BTC-settled contract to a USD total would
 * add 1 BTC to a column labelled dollars.
 */
export class OkxAdapter implements PerpVenueAdapter {
  readonly id = "okx" as const;
  readonly label = "OKX";
  readonly supportsLiquidations = true;

  constructor(private readonly http: AxiosService) {}

  async fetchPerps(symbols: string[]): Promise<PerpVenueQuote[]> {
    const coins = symbols
      .map((symbol) => symbol.toUpperCase())
      .filter((symbol) => /^[A-Z0-9]{2,20}$/.test(symbol));

    // Contract sizes first: every notional below depends on them.
    const instruments = await this.instruments();

    const quotes: PerpVenueQuote[] = [];
    for (const coin of coins) {
      const instId = `${coin}-USDT-SWAP`;
      const instrument = instruments.get(instId);
      if (!instrument) continue;

      // OKX answers a missing contract with code 51001 rather than a 404, so the
      // two are settled together and this coin simply does not appear.
      const [interest, funding] = await Promise.all([
        this.okx<OkxOpenInterest>(
          `${OKX}/public/open-interest?instType=SWAP&instId=${instId}`,
        ).catch(() => null),
        this.okx<OkxFundingRate>(
          `${OKX}/public/funding-rate?instId=${instId}`,
        ).catch(() => null),
      ]);

      if (!interest && !funding) continue;

      // `oiUsd` is reported directly, so it is preferred over the conversion;
      // the conversion is the fallback for when OKX omits it.
      const contracts = venueNumber(interest?.oi);
      const oiCcy = venueNumber(interest?.oiCcy);
      const price =
        venueNumber(funding?.idxPrice) ?? venueNumber(funding?.premium);

      quotes.push({
        venue: this.id,
        instrument: instId,
        symbol: coin,
        markPrice: venueNumber(interest?.markPx) ?? price,
        indexPrice: venueNumber(interest?.idxPx) ?? price,
        openInterestContracts: contracts,
        openInterestUsd:
          venueNumber(interest?.oiUsd) ??
          (oiCcy !== null && price !== null ? oiCcy * price : null),
        volume24hUsd: null,
        // `fundingRate` is the rate that *just* settled; `nextFundingRate` is
        // the one currently accruing and is what a trader is positioned on, so
        // it is preferred when present.
        fundingRate:
          venueNumber(funding?.nextFundingRate) ??
          venueNumber(funding?.fundingRate),
        fundingIntervalHours: 8,
        nextFundingAt: venueNumber(funding?.nextFundingTime),
        longShortAccountRatio: null,
        takerBuySellRatio: null,
      });
    }

    return quotes;
  }

  async fetchLiquidations(symbols: string[]): Promise<LiquidationPrint[]> {
    const coins = symbols
      .map((symbol) => symbol.toUpperCase())
      .filter((symbol) => /^[A-Z0-9]{2,20}$/.test(symbol));

    const instruments = await this.instruments();
    const prints: LiquidationPrint[] = [];

    for (const coin of coins) {
      const uly = `${coin}-USDT`;
      const contractSize = instruments.get(`${uly}-SWAP`) ?? null;

      const orders = await this.okx<OkxLiquidationOrder[]>(
        `${OKX}/public/liquidation-orders` +
          `?instType=SWAP&uly=${uly}&state=filled&limit=100`,
      ).catch(() => null);

      for (const order of orders ?? []) {
        for (const detail of order.details ?? []) {
          const size = venueNumber(detail.sz);
          const bankruptcyPrice = venueNumber(detail.bkPx);
          const posSide = detail.posSide?.toLowerCase();

          // `net` means the venue netted the position off before liquidating it;
          // there is no side to report and guessing one would corrupt the split.
          if (posSide !== "long" && posSide !== "short") continue;

          prints.push({
            venue: this.id,
            symbol: coin,
            side: posSide,
            price: bankruptcyPrice,
            quantity:
              size !== null && contractSize !== null
                ? size * contractSize
                : null,
            usd:
              size !== null && contractSize !== null && bankruptcyPrice !== null
                ? size * contractSize * bankruptcyPrice
                : null,
            timestamp: venueNumber(detail.ts) ?? Date.now(),
          });
        }
      }
    }

    return prints.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Contract sizes, keyed by instrument.
   *
   * Fetched and cached for the process lifetime: it changes when OKX lists a
   * contract, not between refreshes, and it gates the correctness of every
   * notional this adapter reports.
   */
  private contractSizes: Promise<Map<string, number>> | null = null;

  private instruments(): Promise<Map<string, number>> {
    this.contractSizes ??= this.okx<OkxInstrument[]>(
      `${OKX}/public/instruments?instType=SWAP`,
    )
      .then((rows) => {
        const map = new Map<string, number>();
        for (const row of rows ?? []) {
          const size = venueNumber(row.ctVal);
          if (row.instId && size !== null) map.set(row.instId, size);
        }
        return map;
      })
      // A failure here must not poison the cache: the promise is cleared so the
      // next refresh retries rather than reporting zero notionals forever.
      .catch((error: unknown) => {
        this.contractSizes = null;
        throw error;
      });
    return this.contractSizes;
  }

  /** Unwraps OKX's `{ code, msg, data }` envelope, throwing on a failure code. */
  private async okx<T>(url: string): Promise<T> {
    const { data } = await this.http.get<OkxEnvelope<T>>(url, {
      timeout: 10_000,
      headers: { Accept: "application/json" },
    });
    if (data?.code !== "0") {
      throw new Error(`OKX said ${data?.code}: ${data?.msg ?? "unknown"}`);
    }
    return (data?.data ?? []) as T;
  }
}

type OkxEnvelope<T> = { code?: string; msg?: string; data?: T };

type OkxInstrument = { instId?: string; ctVal?: string };

type OkxOpenInterest = {
  instId?: string;
  oi?: string;
  oiCcy?: string;
  oiUsd?: string;
  idxPx?: string;
  markPx?: string;
};

type OkxFundingRate = {
  fundingRate?: string;
  nextFundingRate?: string;
  fundingTime?: string;
  nextFundingTime?: string;
  /** OKX calls the index price `idxPrice` on the funding endpoint. */
  idxPrice?: string;
  premium?: string;
};

type OkxLiquidationOrder = {
  instId?: string;
  details?: {
    sz?: string;
    bkPx?: string;
    posSide?: string;
    ts?: string;
  }[];
};
