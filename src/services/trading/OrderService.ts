import "server-only";

import { AppSignleton } from "~/lib/container";
import { env } from "~/env.js";
import { TelegramNotifier } from "~/services/notify/TelegramNotifier";
import { TradingRepository } from "~/repository/trading.repository";
import { exchangeRegistry } from "~/services/exchanges/ExchangeRegistry";
import {
  compare,
  multiply,
  parseDecimal,
  snapToStep,
  toPlainString,
} from "~/services/trading/decimal";
import { ExchangeError } from "~/services/trading/exchange.port";
import { PaperBroker } from "~/services/trading/PaperBroker";
import type {
  Balance,
  ExchangeId,
  ExchangeSession,
  MarketSpec,
  Order,
  PlaceOrderRequest,
  Position,
  Trade,
} from "~/services/trading/trading.types";

/**
 * The trading use cases.
 *
 * Everything that decides *policy* lives here rather than in an adapter,
 * because policy is venue independent: how much an order is worth, what the
 * operator asked for, whether it is safe to send, and who gets told.
 *
 * ## The Rial problem
 *
 * The board shows one price per instrument, in Rial. An order, however, has to
 * go out in the venue's own quote unit, and only Nobitex quotes its Rial
 * markets in Rial - Wallex, Bitpin and Tabdeal all use Toman. So every price
 * crossing this service is divided by ten on the way to those venues and
 * multiplied by ten on the way back. That factor is stated per market in the
 * catalogue rather than guessed from the symbol, because getting it wrong is a
 * ten-fold order rather than a rejected one.
 */

/** Guards the whole app when no secret is configured. */
export function tradingEnabled(): boolean {
  return env.TRADING_MODE === "paper" || Boolean(env.TRADING_API_SECRET);
}

export type OrderPreview = {
  exchange: ExchangeId;
  instrumentId: string;
  symbol: string;
  side: "buy" | "sell";
  /** Price the operator clicked, Rial. */
  priceInRial: string;
  /** Exactly what will be sent to the venue, in its own quote unit. */
  priceAtVenue: string;
  amount: string;
  /** `price * amount` at the venue, in the venue's quote unit. */
  notionalAtVenue: string;
  /** The same notional in Rial, for comparison against the balance. */
  notionalInRial: string;
  tickSize: string;
  stepSize: string;
  minNotional: string | null;
  /** True when the order's notional clears the venue's published minimum. */
  meetsMinimum: boolean;
  /** True when snapping the inputs moved the price or size at all. */
  adjusted: boolean;
};

@AppSignleton()
export class OrderService {
  constructor(
    private readonly repository: TradingRepository,
    private readonly notifier: TelegramNotifier,
  ) {}

  private get paper(): PaperBroker {
    return new PaperBroker(this.repository);
  }

  private get live(): boolean {
    return env.TRADING_MODE === "live";
  }

  async sessions(): Promise<ExchangeSession[]> {
    const sessions = await exchangeRegistry().sessions();
    if (!this.live) return sessions;
    return sessions;
  }

  /**
   * Recomputes what an order will actually cost, before it is sent.
   *
   * Shown in the confirmation modal so the operator sees the venue's real number
   * rather than trusting that a displayed Rial figure became the right Toman
   * one. This is where a factor-of-ten mistake becomes visible.
   */
  preview(input: {
    exchange: ExchangeId;
    instrumentId: string;
    side: "buy" | "sell";
    priceInRial: string;
    amount: string;
  }): OrderPreview {
    const spec = exchangeRegistry()
      .get(input.exchange)
      .marketSpec(input.instrumentId);

    if (!spec) {
      throw new ExchangeError(
        input.exchange,
        "invalid_request",
        `${input.exchange} does not list ${input.instrumentId}`,
      );
    }

    const venuePrice = rialToVenue(parseDecimal(input.priceInRial), spec);

    /*
     * The tick is applied in the direction that cannot cost the operator.
     *
     * Three of the four venues quote in Toman on a whole-unit grid, so a Rial
     * price rarely lands on a tradable tick and something has to give. Rounding
     * a buy up would commit more money than the screen showed; rounding a sell
     * down would take less than the screen showed. So a buy snaps down and a
     * sell snaps up, which means the price is never worse than the one that was
     * clicked. The ticket displays the difference rather than hiding it.
     *
     * The size always snaps down. An amount larger than the one typed is an
     * order for more than was intended, and a smaller one is merely smaller.
     */
    const snapped = snapToStep(
      venuePrice,
      spec.tickSize,
      input.side === "buy" ? "down" : "up",
    );
    const amount = snapToStep(parseDecimal(input.amount), spec.stepSize, "down");

    const notional = multiply(parseDecimal(snapped.value), parseDecimal(amount.value));
    const notionalInRial = venueToRial(notional, spec);

    return {
      exchange: input.exchange,
      instrumentId: input.instrumentId,
      symbol: spec.symbol,
      side: input.side,
      priceInRial: toPlainString(parseDecimal(input.priceInRial)),
      priceAtVenue: snapped.value,
      amount: amount.value,
      notionalAtVenue: toPlainString(notional),
      notionalInRial: toPlainString(notionalInRial),
      tickSize: spec.tickSize,
      stepSize: spec.stepSize,
      minNotional: spec.minNotional,
      meetsMinimum:
        spec.minNotional === null ||
        compare(notional, parseDecimal(spec.minNotional)) >= 0,
      adjusted:
        toPlainString(venuePrice) !== snapped.value ||
        toPlainString(parseDecimal(input.amount)) !== amount.value,
    };
  }

  /**
   * Places an order.
   *
   * Re-validates the amount regardless of what the caller checked, because the
   * only thing standing between a number typed into a modal and a live order is
   * this function.
   */
  async placeOrder(input: {
    exchange: ExchangeId;
    instrumentId: string;
    side: "buy" | "sell";
    priceInRial: string;
    amount: string;
    kind?: "spot" | "margin" | "futures";
    leverage?: string;
    clientOrderId?: string;
  }): Promise<Order> {
    const preview = this.preview(input);

    if (!preview.meetsMinimum) {
      throw new ExchangeError(
        input.exchange,
        "invalid_request",
        `order value ${preview.notionalAtVenue} is below the ${preview.minNotional ?? "?"} minimum for ${preview.symbol}`,
      );
    }

    const request: PlaceOrderRequest = {
      exchange: input.exchange,
      kind: input.kind ?? "spot",
      instrumentId: input.instrumentId,
      side: input.side,
      // The venue's own unit, snapped to its tick. This is the number the
      // operator's "exact price" guarantee is about.
      price: preview.priceAtVenue,
      amount: preview.amount,
      clientOrderId: input.clientOrderId ?? crypto.randomUUID(),
      ...(input.leverage ? { leverage: input.leverage } : {}),
    };

    let order: Order;
    try {
      order = this.live
        ? await exchangeRegistry().get(input.exchange).placeLimitOrder(request)
        : await this.paper.placeLimitOrder(request);
    } catch (error) {
      // A failed order is the single most important thing to report: it is the
      // case where the operator's intent and reality diverge.
      if (error instanceof ExchangeError) {
        this.notifier.orderFailed(
          `${input.exchange} ${input.side.toUpperCase()} ${input.instrumentId.toUpperCase()} @ ${preview.priceAtVenue}`,
          error.message,
          error.venueCode,
        );
        await this.notifier.flush();
      }
      throw error;
    }

    this.repository.rememberOrderId(
      request.clientOrderId,
      input.exchange,
      order.id,
      order.symbol,
    );

    if (order.status === "filled") {
      this.notifier.orderFilled(order);
    } else {
      this.notifier.orderPlaced(order);
    }
    await this.notifier.flush();

    return order;
  }

  async cancelOrder(order: Order): Promise<void> {
    try {
      if (this.live) {
        await exchangeRegistry().get(order.exchange).cancelOrder(order);
      } else {
        await this.paper.cancelOrder(order);
      }
    } catch (error) {
      if (error instanceof ExchangeError) {
        this.notifier.orderFailed(
          `cancel ${order.exchange} order ${order.id}`,
          error.message,
          error.venueCode,
        );
        await this.notifier.flush();
      }
      throw error;
    }
  }

  /** Pending orders from every configured venue, venue by venue. */
  async openOrders(): Promise<Order[]> {
    const targets = this.live
      ? exchangeRegistry().all()
      : [null];

    const results = await Promise.all(
      targets.map(async (adapter) => {
        try {
          return adapter
            ? await adapter.listOpenOrders()
            : await this.paper.listOpenOrders(this.onlyExchange());
        } catch {
          // One unreachable venue must not blank the whole panel.
          return [];
        }
      }),
    );
    return results.flat().sort((a, b) => b.createdAt - a.createdAt);
  }

  async orderHistory(options: { exchange?: ExchangeId; limit?: number } = {}): Promise<Order[]> {
    if (this.live && options.exchange) {
      return exchangeRegistry().get(options.exchange).listOrderHistory({
        limit: options.limit ?? 100,
      });
    }
    return this.paper.listOrderHistory(options.exchange ?? this.onlyExchange(), {
      limit: options.limit,
    });
  }

  async trades(options: { exchange?: ExchangeId; limit?: number } = {}): Promise<Trade[]> {
    if (this.live && options.exchange) {
      return exchangeRegistry()
        .get(options.exchange)
        .listTrades({ limit: options.limit ?? 100 });
    }
    return this.paper.listTrades(options.exchange ?? this.onlyExchange());
  }

  async balances(): Promise<Balance[]> {
    if (!this.live) return this.paper.getBalances(this.onlyExchange());

    const perVenue = await Promise.all(
      exchangeRegistry().all().map(async (adapter) => {
        try {
          return await adapter.getBalances();
        } catch {
          return [];
        }
      }),
    );
    return perVenue.flat();
  }

  async positions(): Promise<Position[]> {
    if (!this.live) return [];

    const perVenue = await Promise.all(
      exchangeRegistry().all().map(async (adapter) => {
        try {
          return await adapter.listPositions();
        } catch {
          return [];
        }
      }),
    );
    return perVenue.flat();
  }

  async markets(): Promise<MarketSpec[]> {
    const perVenue = await Promise.all(
      exchangeRegistry().all().map(async (adapter) => {
        try {
          return await adapter.listMarkets("spot");
        } catch {
          return [];
        }
      }),
    );
    return perVenue.flat();
  }

  /**
   * The venue a paper session operates against.
   *
   * Paper is single-venue by design: simulating four independent books in one
   * ledger would need four sets of balances and would not tell the operator
   * anything the real per-venue balances would not.
   */
  private onlyExchange(): ExchangeId {
    return "nobitex";
  }
}

/**
 * Rial to the venue's quote unit.
 *
 * Dividing by ten is a pure scale change: the mantissa is untouched and the
 * exponent grows by one. Doing it this way means a Rial price with decimals
 * never loses them, which dividing the integer mantissa would.
 */
export function rialToVenue(
  value: ReturnType<typeof parseDecimal>,
  spec: MarketSpec,
) {
  if (spec.quoteInToman) {
    return { mantissa: value.mantissa, scale: value.scale + 1 };
  }
  return value;
}

/**
 * The venue's quote unit back to Rial, i.e. multiplying by ten.
 *
 * The inverse needs a case that is easy to get wrong. A value with no decimal
 * places cannot be "widened" by dropping a digit, because there is no digit to
 * drop; the mantissa itself has to grow by one. That is the common case, not an
 * edge case - Toman prices are integers - and getting it wrong reports every
 * Toman notional as zero.
 */
export function venueToRial(
  value: ReturnType<typeof parseDecimal>,
  spec: MarketSpec,
) {
  if (spec.quoteInToman) {
    if (value.scale >= 1) {
      return { mantissa: value.mantissa, scale: value.scale - 1 };
    }
    return { mantissa: value.mantissa * 10n, scale: 0 };
  }
  return value;
}
