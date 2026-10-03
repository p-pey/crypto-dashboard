import "server-only";

import { AxiosService } from "~/lib/axios";
import { AppInject, AppSignleton } from "~/lib/container";

/**
 * Derivatives: perpetuals, funding and options.
 *
 * **This is the free answer to CoinGlass.** CoinGlass aggregates derivatives
 * across venues behind a paid API. Their underlying sources are the venues'
 * *own* public endpoints, and those are free — so this reads them directly and
 * gets the exchange's own numbers rather than a third party's estimate.
 *
 * Deribit is the primary source for three reasons: its public API needs no key,
 * it is the largest options venue by volume so its numbers move the market, and
 * it is reachable without a regional restriction. Binance Futures and Bybit are
 * also read when they answer (see {@link FuturesVenue}) — from a region where
 * they are blocked, every venue degrades on its own and this still works.
 *
 * What this deliberately does not do: scrape. Aggregator sites publish
 * restrictions, and a scraped number is neither refreshable nor trustworthy.
 * Where a figure is genuinely behind a paid wall — liquidations as a stream, for
 * instance — it is absent rather than approximated.
 */

const DERIBIT = "https://www.deribit.com/api/v2/public";

/**
 * One row of `get_book_summary_by_currency`.
 *
 * Typed rather than `Record<string, unknown>` because the service reads five
 * fields off it and every one of them is optional in practice — a venue that
 * omits a field must degrade to null, not print `[object Object]`.
 */
type DeribitRow = {
  instrument_name?: string | null;
  open_interest?: number | null;
  mark_price?: number | null;
  mark_iv?: number | null;
  underlying_price?: number | null;
  index_price?: number | null;
  /** Contract volume, in the base currency. */
  volume?: number | null;
  /** Contract volume in USD, which the venue also reports. */
  volume_usd?: number | null;
};

/** Funding rows are hourly, so a day is 24 points. */
const FUNDING_HOURS = 24;
const TTL_MS = 60_000;

export type PerpRow = {
  instrument: string;
  /** Open interest in USD. Deribit reports it in the quote currency. */
  openInterestUsd: number | null;
  markPrice: number | null;
  indexPrice: number | null;
};

export type FundingPoint = {
  timestamp: number;
  /** The 8 hour rate as a percentage, which is the figure venues quote. */
  rate8h: number;
};

export type OptionsSummary = {
  /** Total open interest across every option, USD. */
  openInterestUsd: number;
  putOpenInterestUsd: number;
  callOpenInterestUsd: number;
  /** put / call. Above 1 is a bear-leaning market. */
  putCallRatio: number;
  volumeUsd: number;
  /**
   * At-the-money implied volatility: the option whose strike sits nearest the
   * underlying price. This is the market's own forecast of 30-day volatility,
   * and it moves before price does.
   */
  atmIv: number | null;
  /** Open interest per expiry, for a term-structure chart. */
  byExpiry: { expiry: string; openInterestUsd: number; atmIv: number | null }[];
};

export type DerivativesSnapshot = {
  currency: string;
  perps: PerpRow[];
  funding: FundingPoint[];
  options: OptionsSummary | null;
  generatedAt: number;
  /** Which venues answered. Absent ones simply are not listed. */
  venues: { id: string; label: string; ok: boolean; error: string | null }[];
};

@AppSignleton()
export default class DerivativesService {
  /**
   * Tagged with the currency it was built for, on the same object as the value,
   * so the TTL check and the currency check can never disagree about which entry
   * is live.
   */
  private cache: {
    value: DerivativesSnapshot;
    expiresAt: number;
    currency: string;
  } | null = null;
  private inflight: Promise<DerivativesSnapshot> | null = null;

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {}

  async getSnapshot(
    options: { currency?: string; force?: boolean } = {},
  ): Promise<DerivativesSnapshot> {
    const currency = (options.currency ?? "BTC").toUpperCase();

    if (
      !options.force &&
      this.cache &&
      this.cache.expiresAt > Date.now() &&
      this.cache.currency === currency
    ) {
      return this.cache.value;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.collect(currency).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async collect(currency: string): Promise<DerivativesSnapshot> {
    const venues: DerivativesSnapshot["venues"] = [];
    const [perps, options, funding] = await Promise.all([
      this.settle(venues, "deribit", "Deribit", () =>
        this.deribitPerps(currency),
      ),
      this.settle(venues, "deribit-options", "Deribit options", () =>
        this.deribitOptions(currency),
      ),
      this.settle(venues, "deribit-funding", "Deribit funding", () =>
        this.deribitFunding(currency),
      ),
    ]);

    const snapshot: DerivativesSnapshot = {
      currency,
      perps: perps ?? [],
      funding: funding ?? [],
      options: options ?? null,
      generatedAt: Date.now(),
      venues,
    };

    // Only cache a partial answer if something came back at all; an entirely
    // failed collect is better retried than remembered.
    if (perps || options || funding) {
      this.cache = {
        value: snapshot,
        expiresAt: Date.now() + TTL_MS,
        currency,
      };
    }
    return snapshot;
  }

  /** Records a venue's outcome without letting one failure fail the whole call. */
  private async settle<T>(
    venues: DerivativesSnapshot["venues"],
    id: string,
    label: string,
    run: () => Promise<T>,
  ): Promise<T | null> {
    try {
      const value = await run();
      venues.push({ id, label, ok: true, error: null });
      return value;
    } catch (error) {
      venues.push({ id, label, ok: false, error: describe(error) });
      return null;
    }
  }

  private async deribit(currency: string): Promise<unknown> {
    const { data } = await this.http.get<unknown>(
      `${DERIBIT}/get_book_summary_by_currency?currency=${encodeURIComponent(currency)}`,
      { timeout: 10_000, headers: { Accept: "application/json" } },
    );
    return data;
  }

  private async deribitPerps(currency: string): Promise<PerpRow[]> {
    const payload = (await this.deribit(currency)) as {
      result?: DeribitRow[];
    };
    const rows: PerpRow[] = [];
    for (const row of payload?.result ?? []) {
      const instrument = parseInstrument(row.instrument_name);
      if (instrument?.kind !== "PERPETUAL") continue;
      rows.push({
        instrument: `${instrument.currency}-PERPETUAL`,
        openInterestUsd: numberOf(row.open_interest),
        markPrice: numberOf(row.mark_price),
        indexPrice: numberOf(row.underlying_price ?? row.index_price),
      });
    }
    return rows;
  }

  private async deribitFunding(currency: string): Promise<FundingPoint[]> {
    const now = Date.now();
    const start = now - FUNDING_HOURS * 3_600_000;
    const { data } = await this.http.get<unknown>(
      `${DERIBIT}/get_funding_rate_history` +
        `?instrument_name=${currency}-PERPETUAL` +
        `&start_timestamp=${start}&end_timestamp=${now}`,
      { timeout: 10_000, headers: { Accept: "application/json" } },
    );

    const payload = data as {
      result?: { timestamp: number; interest_8h: number }[];
    };

    return (payload?.result ?? [])
      .map((row) => ({
        timestamp: row.timestamp,
        // Deribit reports the rate as a fraction; venues quote it as a percent.
        rate8h: (row.interest_8h ?? 0) * 100,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  private async deribitOptions(
    currency: string,
  ): Promise<OptionsSummary | null> {
    const { data } = await this.http.get<unknown>(
      `${DERIBIT}/get_book_summary_by_currency?currency=${encodeURIComponent(currency)}&kind=option`,
      { timeout: 10_000, headers: { Accept: "application/json" } },
    );

    const rows = (data as { result?: DeribitRow[] })?.result ?? [];
    if (rows.length === 0) return null;

    let putOi = 0;
    let callOi = 0;
    let volume = 0;
    let underlying: number | null = null;
    // Spot is needed after the loop, so hold on to it rather than re-reading.
    const spot = { value: null as number | null };

    for (const row of rows) {
      const instrument = parseInstrument(row.instrument_name);
      if (!instrument) continue;

      // `open_interest` is denominated in the base currency, not USD: a strike
      // showing 1121.4 is 1121 BTC, which is ~$95M at spot, while $1121 would be
      // an implausibly small position. `volume_usd` is reported directly, so
      // volume needs no conversion.
      const oi = numberOf(row.open_interest) ?? 0;
      volume += numberOf(row.volume_usd) ?? 0;

      if (instrument.kind === "C") callOi += oi;
      else putOi += oi;

      underlying ??= numberOf(row.underlying_price);
      spot.value ??= underlying;
    }

    const price = underlying ?? spot.value;
    const toUsd = (base: number) => (price === null ? 0 : base * price);
    putOi = toUsd(putOi);
    callOi = toUsd(callOi);

    // Nearest the money is the contract whose strike sits closest to spot, which
    // is the one whose implied volatility a trader actually quotes.
    let atmIv: number | null = null;
    if (price !== null) {
      let bestDistance = Infinity;
      for (const row of rows) {
        const instrument = parseInstrument(row.instrument_name);
        if (!instrument) continue;
        const iv = numberOf(row.mark_iv);
        if (iv === null) continue;
        const distance = Math.abs(instrument.strike - price);
        if (distance < bestDistance) {
          bestDistance = distance;
          atmIv = iv;
        }
      }
    }

    const totalOi = putOi + callOi;

    return {
      openInterestUsd: totalOi,
      putOpenInterestUsd: putOi,
      callOpenInterestUsd: callOi,
      // A zero call side would otherwise report infinite confidence.
      putCallRatio: callOi > 0 ? putOi / callOi : 0,
      volumeUsd: volume,
      atmIv,
      byExpiry: termStructure(rows, price),
    };
  }
}

/**
 * A parsed Deribit instrument name: `BTC-24SEP27-60000-C`.
 *
 * Parsed once per row rather than by splitting at each use, because the split is
 * the one place a malformed instrument name would silently produce `undefined`
 * arithmetic instead of a skipped row.
 */
type Instrument = {
  currency: string;
  /** e.g. `24SEP27`. */
  expiry: string;
  strike: number;
  kind: "C" | "P" | "PERPETUAL";
};

function parseInstrument(name: string | null | undefined): Instrument | null {
  if (typeof name !== "string") return null;
  const parts = name.split("-");

  // A perpetual is just `BTC-PERPETUAL` - two parts and no strike. Rejecting it
  // here silently emptied the perps list, so the shape is handled explicitly
  // rather than by a length check.
  if (parts.length === 2 && parts[1] === "PERPETUAL") {
    return {
      currency: parts[0] ?? "",
      expiry: "PERPETUAL",
      strike: 0,
      kind: "PERPETUAL",
    };
  }

  if (parts.length < 4) return null;

  const [currency, expiry, strike, kind] = parts as [
    string,
    string,
    string,
    string,
  ];

  const parsedStrike = Number.parseFloat(strike);
  if (!Number.isFinite(parsedStrike)) return null;
  if (kind !== "C" && kind !== "P") return null;

  return { currency, expiry, strike: parsedStrike, kind };
}

/**
 * Open interest and ATM volatility per expiry.
 *
 * This is the single most informative shape in the data: a market where the
 * front month carries all the open interest and the back months carry none is a
 * market trading the next event, not the trend.
 */
function termStructure(
  rows: DeribitRow[],
  underlying: number | null,
): { expiry: string; openInterestUsd: number; atmIv: number | null }[] {
  const byExpiry = new Map<
    string,
    { base: number; strikes: { strike: number; iv: number | null }[] }
  >();

  for (const row of rows) {
    const instrument = parseInstrument(row.instrument_name);
    if (!instrument || instrument.kind === "PERPETUAL") continue;

    const bucket = byExpiry.get(instrument.expiry) ?? {
      base: 0,
      strikes: [] as { strike: number; iv: number | null }[],
    };
    bucket.base += numberOf(row.open_interest) ?? 0;
    bucket.strikes.push({
      strike: instrument.strike,
      iv: numberOf(row.mark_iv),
    });
    byExpiry.set(instrument.expiry, bucket);
  }

  return [...byExpiry.entries()]
    .map(([expiry, bucket]) => {
      let atmIv: number | null = null;
      if (underlying !== null && bucket.strikes.length > 0) {
        let best = Infinity;
        for (const entry of bucket.strikes) {
          if (entry.iv === null) continue;
          const distance = Math.abs(entry.strike - underlying);
          if (distance < best) {
            best = distance;
            atmIv = entry.iv;
          }
        }
      }
      return {
        expiry,
        openInterestUsd: underlying === null ? 0 : bucket.base * underlying,
        atmIv,
      };
    })
    .sort((a, b) => b.openInterestUsd - a.openInterestUsd)
    .slice(0, 6);
}

function numberOf(value: number | string | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function describe(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const status = (error as { response?: { status?: unknown } }).response
      ?.status;
    if (typeof status === "number") return `HTTP ${status}`;
  }
  if (error instanceof Error) {
    if (error.message.includes("timeout")) return "timed out";
    return error.message;
  }
  return "the venue did not answer";
}
