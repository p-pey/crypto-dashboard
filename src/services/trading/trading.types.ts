/**
 * The trading domain model.
 *
 * Two conventions hold everywhere below:
 *
 * 1. **Every monetary and quantity field is a decimal string, never a number.**
 *    These values cross an HTTP boundary and get re-parsed by the exchange, so
 *    the string is the contract. A `number` would silently lose precision on a
 *    50,000,000,000 Rial order and would let a double reach the wire.
 *
 * 2. **`null` means "this venue did not tell us"**, not "zero". Nobitex reports
 *    realised PNL on closed positions and not open ones, for example, and a
 *    missing figure must never render as a real 0.
 *
 * The model is deliberately venue agnostic. Nobitex, Wallex, Bitpin and Tabdeal
 * disagree about almost everything — symbol spelling, quote unit, side casing,
 * how a partial fill is spelled — and that disagreement is confined to the
 * adapters in `src/services/exchanges`. Nothing above this file knows any of
 * it.
 */

/** Venues an order can be routed to. */
export type ExchangeId = "nobitex" | "wallex" | "bitpin" | "tabdeal" | "bitunix";

export const EXCHANGE_IDS: readonly ExchangeId[] = [
  "nobitex",
  "wallex",
  "bitpin",
  "tabdeal",
  "bitunix",
];

export type OrderSide = "buy" | "sell";
export type OrderKind = "spot" | "margin" | "futures";

/**
 * Lifecycle in this app's terms, not any venue's.
 *
 * The four exchange vocabularies collapse onto these: Nobitex's
 * New/Active/Inactive/Done/Canceled, Wallex's opaque strings, Bitpin's
 * initial/active/closed and Tabdeal's Binance-style NEW/PARTIALLY_FILLED/
 * FILLED/CANCELED/REJECTED.
 */
export type OrderStatus =
  | "open" // resting on the book, nothing filled yet
  | "partially_filled" // some size traded, some still resting
  | "filled" // fully matched
  | "canceled" // withdrawn, may still have a partial fill
  | "rejected" // the venue refused it
  | "expired"; // good-till-cancelled orders on venues that expire them

export const OPEN_STATUSES: readonly OrderStatus[] = [
  "open",
  "partially_filled",
];

/** A tradable market as this app refers to it. */
export type Instrument = {
  /** Stable id used across the app, e.g. `xaut`. */
  readonly id: string;
  /** Base instrument being traded: `USDT`, `XAUT`, `PAXG`, `GOLD18K`. */
  readonly baseAsset: string;
  /**
   * What the price is denominated in: `rls` or `usdt`.
   *
   * Deliberately *not* the display unit. The board normalises every Iranian
   * price to Rial, but an order has to be sent in the venue's own quote unit,
   * and Tabdeal and Bitpin quote their Rial markets in Toman. That conversion
   * belongs to the instrument, not to the UI.
   */
  readonly quoteAsset: "rls" | "usdt";
  readonly labelKey: string;
  readonly kind: "stablecoin" | "digital_gold" | "physical_gold";
};

/**
 * A market as a venue describes it.
 *
 * Fetched from each venue's own metadata endpoint rather than hardcoded,
 * because a tick size or a minimum order that drifts between releases is
 * exactly the kind of thing that produces a rejected order at 03:00.
 */
export type MarketSpec = {
  readonly exchange: ExchangeId;
  /** The venue's own spelling, passed back verbatim on every call. */
  readonly symbol: string;
  readonly instrumentId: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  /** True when this venue quotes the market in Toman and the board in Rial. */
  readonly quoteInToman: boolean;
  /** Price increment as decimal text, e.g. `"10"` or `"0.1"`. */
  readonly tickSize: string;
  /** Size increment as decimal text, e.g. `"0.00001"`. */
  readonly stepSize: string;
  /** Minimum total order value in the quote unit, when the venue publishes one. */
  readonly minNotional: string | null;
  readonly tradable: boolean;
  readonly fetchedAt: number;
};

/** What the operator asked us to do, in app terms. */
export type PlaceOrderRequest = {
  readonly exchange: ExchangeId;
  readonly kind: OrderKind;
  readonly instrumentId: string;
  readonly side: OrderSide;
  /** Exact limit price in the venue's quote unit, as decimal text. */
  readonly price: string;
  /**
   * Size in the base instrument, as decimal text.
   *
   * Always base units, never quote. A quote-sized order would depend on a
   * conversion the user cannot see, and the whole point of this feature is that
   * the number on screen is the number sent.
   */
  readonly amount: string;
  /**
   * Our own idempotency key.
   *
   * Sent to venues that accept one so a network retry cannot open the same
   * order twice. Nobitex also rejects a byte-identical order within 10 seconds,
   * so this doubles as the duplicate guard there.
   */
  readonly clientOrderId: string;
  /** Margin/futures only. Ignored for spot. */
  readonly leverage?: string;
  readonly reduceOnly?: boolean;
};

export type Order = {
  /** The venue's id, as a string because Nobitex and Tabdeal disagree on type. */
  readonly id: string;
  readonly clientOrderId: string | null;
  readonly exchange: ExchangeId;
  readonly kind: OrderKind;
  readonly instrumentId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly status: OrderStatus;
  /** Limit price, quote unit. */
  readonly price: string;
  /** Requested size, base unit. */
  readonly amount: string;
  /** Size actually matched so far, base unit. */
  readonly filledAmount: string;
  /** Volume-weighted average fill price so far. */
  readonly averagePrice: string | null;
  /** `price * filledAmount`, quote unit. */
  readonly filledValue: string | null;
  /** Venue fee charged so far, in whichever asset the venue charges it. */
  readonly fee: string | null;
  readonly feeAsset: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Venue message when the order was rejected or cancelled with a reason. */
  readonly note: string | null;
};

/** One fill. A resting order produces many of these, one per match. */
export type Trade = {
  readonly id: string;
  readonly orderId: string;
  readonly exchange: ExchangeId;
  readonly instrumentId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly price: string;
  readonly amount: string;
  readonly value: string;
  readonly fee: string | null;
  readonly feeAsset: string | null;
  readonly tradedAt: number;
};

/**
 * One asset holding.
 *
 * `free` is what can be committed to a new order and `locked` is what an open
 * order or position has already reserved. Venues disagree on the arithmetic:
 * Nobitex publishes `activeBalance` outright, Wallex gives total and locked,
 * Tabdeal gives free and frozen, Bitpin's `balance` is already net of frozen.
 * The adapter resolves that; the rest of the app only ever reads `free`.
 */
export type Balance = {
  readonly exchange: ExchangeId;
  /** Uppercase asset code: `RLS`, `IRT`, `USDT`, `XAUT`, `PAXG`. */
  readonly asset: string;
  readonly free: string;
  readonly locked: string;
  /** `free + locked`, when the venue lets us compute it. */
  readonly total: string;
  /** Best-effort value in Rial, for a portfolio total. Null when unpriceable. */
  readonly valueInRial: string | null;
};

export type PositionSide = "long" | "short";
export type PositionStatus = "open" | "closed" | "liquidated" | "expired";

export type Position = {
  readonly id: string;
  readonly exchange: ExchangeId;
  readonly kind: OrderKind;
  readonly instrumentId: string;
  readonly symbol: string;
  readonly side: PositionSide;
  readonly status: PositionStatus;
  readonly leverage: string | null;
  /** Size, base unit. */
  readonly size: string;
  readonly entryPrice: string;
  /** Venue's liquidation trigger. Null on venues that do not publish one. */
  readonly liquidationPrice: string | null;
  /** Unrealised result in the venue's margin asset, quote unit. */
  readonly unrealizedPnl: string | null;
  /** Unrealised result as a percentage of the margin posted. */
  readonly unrealizedPnlPercent: string | null;
  readonly realizedPnl: string | null;
  /** Margin committed to this position, quote unit. */
  readonly margin: string | null;
  readonly openedAt: number | null;
  readonly closedAt: number | null;
};

/** Which venues actually have usable credentials, resolved at boot. */
export type ExchangeSession = {
  readonly exchange: ExchangeId;
  readonly label: string;
  /** False when no credential is configured, or the credential check failed. */
  readonly ready: boolean;
  readonly kind: "spot" | "spot+margin" | "spot+futures" | "spot+margin+futures";
  /** Levers this venue exposes, so the UI can hide what does not exist. */
  readonly supportsMargin: boolean;
  readonly supportsFutures: boolean;
  readonly note: string | null;
};
