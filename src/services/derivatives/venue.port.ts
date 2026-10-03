import "server-only";

/**
 * The single seam between the derivatives application and any perpetual venue.
 *
 * CoinGlass sells an aggregate of exactly these numbers. Their underlying
 * sources are the venues' own public endpoints, so this port lets the app
 * assemble the same aggregate from the exchanges themselves — free, keyless, and
 * carrying the venue's own figures rather than a third party's estimate.
 *
 * The interface is a port and not a base class because the differences are
 * genuine incompatibility rather than missing implementation:
 *
 * - **Open interest arrives in four different units.** Hyperliquid reports coin
 *   amount, Binance reports coin amount under a different name, OKX reports
 *   contracts and Bybit reports coin amount plus a separate USD figure. Only a
 *   venue adapter knows which.
 * - **Not every venue publishes liquidations.** Deribit, Hyperliquid and Bitget
 *   do not expose them at all; Binance, Bybit and OKX do. A missing feed is not
 *   a zero — see {@link PerpVenueAdapter.supportsLiquidations}.
 * - **Funding intervals differ.** Most are 8h, Bitget can be 1h or 4h on some
 *   pairs, Hyperliquid quotes hourly. Reporting all of them as "the 8h rate"
 *   would compare two different things and call it a signal.
 *
 * Contract for implementors:
 *
 * - **Normalise at the edge.** Everything above this seam sees fractions for
 *   rates and USD for notional. An adapter that leaks a venue's native unit
 *   makes every comparison downstream wrong by orders of magnitude.
 * - **A venue that does not answer throws.** The service settles each adapter
 *   independently and records what failed; an adapter must never swallow its own
 *   error and return `[]`, or a geo-block reads as a quiet market.
 * - **No key, ever.** These are public market-data endpoints. If a figure needs a
 *   credential it does not belong here.
 */
export type VenueId =
  "deribit" | "hyperliquid" | "bitget" | "mexc" | "binance" | "bybit" | "okx";

/** Which side of the book was force-closed. */
export type LiquidationSide = "long" | "short";

/**
 * One venue's read on one perpetual contract.
 *
 * Every figure is nullable because every one of them is optional in practice: a
 * venue that omits a field must degrade to null rather than print a zero, since
 * a zero open interest and an unreported open interest look identical on a
 * chart and mean opposite things.
 */
export type PerpVenueQuote = {
  venue: VenueId;
  /** The venue's own instrument name, kept so a row can be traced back. */
  instrument: string;
  /** Base currency, uppercased. The join key across venues. */
  symbol: string;

  markPrice: number | null;
  indexPrice: number | null;

  /** Open interest in the base currency, as the venue reports it. */
  openInterestContracts: number | null;
  /**
   * Open interest in USD.
   *
   * Null when the venue gave contracts but no price to convert them with, which
   * is a real case: the aggregate then reports the venue's contracts separately
   * rather than inventing a dollar figure.
   */
  openInterestUsd: number | null;
  /** Rolling 24h notional, USD. */
  volume24hUsd: number | null;

  /**
   * The current funding rate as a **fraction** (`0.0001`, not `0.01`).
   *
   * A fraction, because that is how every venue publishes it and converting it
   * twice is how a rate ends up a hundredfold out. Display converts once.
   */
  fundingRate: number | null;
  /**
   * Hours between funding settlements: 8 nearly everywhere, 1 or 4 on some
   * venues. Carried per quote because a funding rate is meaningless without the
   * interval it applies to.
   */
  fundingIntervalHours: number | null;
  nextFundingAt: number | null;

  /** Accounts long ÷ accounts short, when the venue publishes it. */
  longShortAccountRatio: number | null;
  /** Taker buy volume ÷ taker sell volume, when the venue publishes it. */
  takerBuySellRatio: number | null;
};

/** One forced liquidation, as printed on the venue's tape. */
export type LiquidationPrint = {
  venue: VenueId;
  symbol: string;
  /**
   * The side that was liquidated, which is the opposite of the side that took
   * the other side of the trade: a `long` liquidation means longs were closed
   * and the seller was the aggressor.
   */
  side: LiquidationSide;
  price: number | null;
  /** Base-currency quantity. */
  quantity: number | null;
  usd: number | null;
  timestamp: number;
};

export interface PerpVenueAdapter {
  readonly id: VenueId;
  readonly label: string;

  /**
   * Whether this venue publishes liquidations at all.
   *
   * Distinguishes "quiet" from "does not exist". A panel that shows an
   * aggregate over three of seven venues must be able to say the other four
   * never publish the figure, rather than implying the market was calm.
   */
  readonly supportsLiquidations: boolean;

  /**
   * Current perps metrics for the requested coins.
   *
   * `symbols` is a filter, not a requirement: an adapter covering an entire
   * venue in one request (Hyperliquid) may ignore it and return everything,
   * which is cheaper than any alternative. Returning more than asked for is
   * allowed; returning venues other than `id` is not.
   */
  fetchPerps(symbols: string[]): Promise<PerpVenueQuote[]>;

  /**
   * Recent forced liquidations, newest first.
   *
   * Throws rather than returning `[]` when the venue does not answer, and is
   * only called on adapters whose `supportsLiquidations` is true.
   */
  fetchLiquidations(symbols: string[]): Promise<LiquidationPrint[]>;
}

/**
 * A liquidations feed that is not reachable, and why.
 *
 * Reported to the UI rather than swallowed, because the difference between
 * "no liquidations happened" and "this venue is geo-blocked here" is the whole
 * difference between a calm market and a broken panel.
 */
export type VenueOutcome = {
  id: VenueId;
  label: string;
  ok: boolean;
  /**
   * `unsupported` means the venue has no such feed — not an error, and shown
   * differently from a failure.
   */
  error: string | null;
  unsupported?: boolean;
  /** Prints found, for the venues that answered. */
  count?: number;
};

/**
 * Coerces a venue's number-ish field to a number.
 *
 * The single most common shape difference across these APIs: Hyperliquid sends
 * `"37122.89212"` as a string, Deribit sends a float, OKX sometimes sends `""`.
 * Without this, an OI of `"0"` and an OI of `""` both become `NaN` and silently
 * vanish from the aggregate.
 */
export function venueNumber(
  value: number | string | null | undefined,
): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Normalises a funding interval to hours.
 *
 * Venues publish this as a number of minutes, a number of hours or an enum
 * depending on the endpoint, and MEXC reports it as a cycle code. Anything
 * unrecognised is null rather than a guess, because a wrong interval turns a
 * funding comparison into a units error.
 */
export function venueIntervalHours(
  raw: number | string | null | undefined,
): number | null {
  const parsed = venueNumber(raw);
  if (parsed === null || parsed <= 0) return null;
  // A venue quoting minutes (480) and one quoting hours (8) both land here; the
  // only interval that is never legitimate is above a day.
  if (parsed > 24) return Math.round((parsed / 60) * 100) / 100;
  return parsed;
}
