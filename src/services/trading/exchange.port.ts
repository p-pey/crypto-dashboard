import "server-only";

import type {
  Balance,
  ExchangeId,
  ExchangeSession,
  MarketSpec,
  Order,
  OrderKind,
  PlaceOrderRequest,
  Position,
  Trade,
} from "./trading.types";

/**
 * The single seam between the trading application and any venue.
 *
 * Everything above this interface is written against the domain model and has
 * no idea which exchange it is talking to. Everything below it is one adapter
 * per venue, and each one is responsible for the full breadth of that venue's
 * peculiarities: how it authenticates, how it spells a symbol, whether its
 * Rial markets are really Toman, whether it returns a business failure with an
 * HTTP 200, and whether its "amount" field means base units.
 *
 * That last list is why the interface is a port and not a base class. The
 * differences are genuine incompatibility, not missing implementation, and
 * pretending otherwise would push branching into every caller.
 *
 * Contract for implementors:
 *
 * - **Money in, money out as decimal strings.** Never a `number`. Use
 *   `src/services/trading/decimal` for any arithmetic.
 * - **Money out is in the venue's own quote unit.** A Tabdeal Rial market is
 *   Toman and a Wallex one always is; converting to Rial happens above this
 *   seam, never inside an adapter.
 * - **Raise {@link ExchangeError}, never return a failed Order.** Callers have
 *   one error path to handle.
 * - **A rejected order is not an exception.** It is an `Order` with status
 *   `rejected` and a populated `note`, because the venue accepted the request
 *   and then declined it, and the operator needs to see both.
 * - **Read methods may return `[]` on failure rather than throwing**, so one
 *   unreachable venue does not blank the whole screen. `listMarkets` follows the
 *   same rule.
 */
export interface ExchangeAdapter {
  readonly id: ExchangeId;
  readonly label: string;

  /**
   * Cheap reachability and credential check.
   *
   * Called on boot to decide whether to show this venue's buttons. Must not
   * place, cancel or transfer anything, and should not throw: an unreachable
   * venue is a `ready: false` with a `note`, not an error.
   */
  probe(): Promise<ExchangeSession>;

  /**
   * The venue's markets and their trading rules.
   *
   * Cached aggressively and refreshed on a long interval: a step size or a
   * minimum order that drifts between releases is exactly what causes an order
   * to be rejected at an awkward hour.
   */
  listMarkets(kind: OrderKind): Promise<MarketSpec[]>;

  /** The venue's book for one market, used by the paper engine and the board. */
  getOrderBook(
    symbol: string,
  ): Promise<{ bids: [string, string][]; asks: [string, string][] } | null>;

  /** Per-asset holdings, already normalised to `free` plus `locked`. */
  getBalances(): Promise<Balance[]>;

  /**
   * Submits a limit order.
   *
   * The price is passed through unchanged apart from snapping to the market's
   * tick, because the operator's guarantee is that the order rests at the
   * number they saw. A resting limit order may stay unfilled indefinitely; that
   * is the intended behaviour, not a bug.
   */
  placeLimitOrder(request: PlaceOrderRequest): Promise<Order>;

  cancelOrder(
    order: Pick<Order, "id" | "symbol" | "clientOrderId">,
  ): Promise<void>;

  /** Currently resting orders. */
  listOpenOrders(symbol?: string): Promise<Order[]>;

  /**
   * Historical orders.
   *
   * Sourced from the venue rather than a local table, because the operator
   * explicitly wants the exchange to be the record. Note that retention differs
   * sharply: Bitpin drops fully-unfilled orders after seven days, so this is
   * not a complete audit trail on every venue.
   */
  listOrderHistory(options: {
    symbol?: string;
    limit?: number;
  }): Promise<Order[]>;

  /** Individual fills, for realised PNL. */
  listTrades(options: { symbol?: string; limit?: number }): Promise<Trade[]>;

  /** Open leveraged positions. Empty on venues without leverage. */
  listPositions(): Promise<Position[]>;

  /** Closes a position. Venues without leverage throw `unsupported`. */
  closePosition(
    position: Pick<Position, "id" | "symbol">,
    options?: { price?: string; amount?: string },
  ): Promise<Order>;

  /**
   * Attaches protective levels to an open position.
   *
   * **This is the one place where the venues genuinely differ, and the difference
   * matters more than the signature suggests.**
   *
   * Tabdeal's perpetual API has a real `positionSlTp` endpoint, so the stop lives
   * on the exchange: it survives a restart, it fills even if this app is dead, and
   * it is enforced by the matching engine rather than by a poll.
   *
   * Nobitex's margin product has **no such endpoint**. There is nothing to call and
   * nothing to configure. A stop there can only be emulated: this app remembers the
   * level, watches the price, and places a reduce order when the price crosses. That
   * is a meaningfully weaker guarantee - it depends on the process being alive, on
   * the poll interval, and on the reduce order itself succeeding.
   *
   * So the result reports which of the two happened rather than pretending they are
   * the same thing. The UI is expected to show it, because "my stop is live on the
   * exchange" and "my stop only exists while your app is running" are not the same
   * statement.
   */
  setPositionProtection(
    position: Pick<Position, "id" | "symbol">,
    protection: { takeProfit?: string | null; stopLoss?: string | null },
  ): Promise<ProtectionResult>;
}

/** How a protective level is actually enforced for a given venue. */
export type ProtectionMode =
  /**
   * The exchange holds the level. It survives this app going away and is enforced
   * by the venue's own engine.
   */
  | "native"
  /**
   * This app holds the level and fires a reduce order when the price crosses. It
   * only works while the process is running, and it consumes a real order slot when
   * it fires.
   */
  | "emulated"
  /** The venue has no leverage at all, so there is nothing to protect. */
  | "unsupported";

export type ProtectionResult = {
  readonly mode: ProtectionMode;
  /** What was actually stored, in the venue's quote unit. */
  readonly takeProfit: string | null;
  readonly stopLoss: string | null;
  /**
   * A sentence the UI can show as-is. Present whenever the mode is not `native`,
   * because that is exactly when the operator needs to know what they are relying
   * on.
   */
  readonly note: string | null;
};

/** Why a venue call failed, in terms the UI can branch on. */
export type ExchangeErrorKind =
  | "unauthorized" // credentials missing, expired or wrong
  | "forbidden" // authenticated but not permitted (no trade scope, KYC)
  | "insufficient_funds"
  | "invalid_request" // our own bug: bad symbol, step, minimum
  | "rejected" // the venue understood and declined
  | "rate_limited"
  | "unavailable" // network, 5xx, geo-block
  | "unsupported" // this venue does not offer the requested capability
  | "unknown";

/**
 * The one error type that crosses the seam.
 *
 * `venueCode` preserves the exchange's own machine-readable code, which is what
 * the operator should quote when contacting support: Nobitex's `BadPrice` and
 * Tabdeal's `1208` mean the same thing and neither means anything on its own.
 */
export class ExchangeError extends Error {
  constructor(
    readonly exchange: ExchangeId,
    readonly kind: ExchangeErrorKind,
    message: string,
    readonly venueCode: string | null = null,
    readonly retryAfterSeconds: number | null = null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ExchangeError";
  }

  static unsupported(exchange: ExchangeId, what: string): ExchangeError {
    return new ExchangeError(
      exchange,
      "unsupported",
      `${exchange} does not support ${what}`,
    );
  }
}

export function isExchangeError(value: unknown): value is ExchangeError {
  return value instanceof ExchangeError;
}
