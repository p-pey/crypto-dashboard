import "server-only";

import { randomUUID } from "node:crypto";

import { env } from "~/env.js";
import { VENUE_MARKETS } from "~/constants/tradingInstruments";
import { exchangeRegistry } from "~/services/exchanges/ExchangeRegistry";
import type { TradingRepository } from "~/repository/trading.repository";
import {
  compare,
  isNegative,
  multiply,
  parseDecimal,
  snapToStep,
  toPlainString,
} from "~/services/trading/decimal";
import { ExchangeError } from "~/services/trading/exchange.port";
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
 * The paper broker: a simulated venue that fills against the real order book.
 *
 * Paper mode exists so the whole path - validation, step snapping, notification,
 * partial fills, cancellation - can be exercised without risking money. It is
 * deliberately *not* a stub that always fills immediately, because that would
 * hide exactly the behaviour the operator cares about: an order that rests.
 *
 * ## How a fill is decided
 *
 * A resting buy at price P fills when the live best **bid** reaches P. A
 * resting sell at P fills when the live best **ask** drops to P. In both cases
 * the fill price is exactly P, never better and never worse, which is what a
 * real maker order does and what the operator asked for.
 *
 * The book used for that decision is the venue's real book, fetched through the
 * public endpoint, so a paper fill means "the real market moved to my price".
 * That is a meaningful statement even though the money is not real.
 *
 * ## Partial fills
 *
 * The operator said they do not mind a partial fill and will wait or cancel
 * manually. So a fill is modelled as all-or-nothing per check, and the order
 * moves to `filled`. Overstating realism here would add queue-position modelling
 * that no public endpoint can support, and a queue model that cannot be verified
 * is worse than an honest simplification.
 */

/** Minimum notional used when validating a simulated order, in Rial. */
const PAPER_MIN_NOTIONAL_RIAL = 500_000;

export class PaperBroker {
  constructor(private readonly repository: TradingRepository) {}

  /** The venue whose real book drives this simulation. */
  private venueOf(exchange: ExchangeId) {
    return exchangeRegistry().get(exchange);
  }

  private specFor(exchange: ExchangeId, instrumentId: string): MarketSpec {
    const spec = this.venueOf(exchange).marketSpec(instrumentId);
    if (!spec) {
      throw new ExchangeError(
        exchange,
        "invalid_request",
        `${exchange} does not list ${instrumentId}`,
      );
    }
    return spec;
  }

  /** Quote asset as the app canonicalises it, for the simulated ledger. */
  private quoteAssetOf(spec: MarketSpec): string {
    return spec.quoteAsset === "usdt" ? "USDT" : "RLS";
  }

  /**
   * Places a simulated limit order.
   *
   * The price is snapped to the market tick and the size to the lot step before
   * anything is recorded, so a simulated order can never carry a value a real
   * venue would reject. Discovering that here is the point of paper mode.
   */
  async placeLimitOrder(request_: PlaceOrderRequest): Promise<Order> {
    const spec = this.specFor(request_.exchange, request_.instrumentId);

    // Same rule as the live path: a buy never snaps above the price asked for,
    // a sell never below it.
    const price = snapToStep(
      parseDecimal(request_.price),
      spec.tickSize,
      request_.side === "buy" ? "down" : "up",
    );
    const amount = snapToStep(
      parseDecimal(request_.amount),
      spec.stepSize,
      "down",
    );

    if (!price.exact || !amount.exact) {
      throw new ExchangeError(
        request_.exchange,
        "invalid_request",
        `${spec.symbol} has a price or size increment this app cannot express`,
      );
    }

    const sized = parseDecimal(amount.value);
    const costed = multiply(parseDecimal(price.value), sized);

    if (isNegative(sized) || sized.mantissa === 0n) {
      throw new ExchangeError(
        request_.exchange,
        "invalid_request",
        "amount must be positive",
      );
    }

    const venueMarket =
      VENUE_MARKETS[request_.exchange]?.[request_.instrumentId];
    const minimum = venueMarket?.minNotional ?? String(PAPER_MIN_NOTIONAL_RIAL);

    // Notional is compared in the venue's own quote unit, so a Toman market is
    // checked against the Toman minimum rather than the Rial one.
    if (compare(costed, parseDecimal(minimum)) < 0) {
      throw new ExchangeError(
        request_.exchange,
        "invalid_request",
        `order value ${toPlainString(costed)} is below the ${minimum} minimum for ${spec.symbol}`,
      );
    }

    // Spendable funds are checked here as well as on the venue, so the operator
    // finds out before the notification rather than after.
    const quoteAsset = this.quoteAssetOf(spec);
    const spent =
      request_.side === "buy"
        ? { asset: quoteAsset, need: toPlainString(costed) }
        : { asset: spec.baseAsset, need: amount.value };

    const balance = this.repository
      .getPaperBalances(request_.exchange)
      .find((row) => row.asset === spent.asset);

    const held = parseDecimal(balance?.free ?? "0");
    if (compare(held, parseDecimal(spent.need)) < 0) {
      throw new ExchangeError(
        request_.exchange,
        "insufficient_funds",
        `paper balance has ${toPlainString(held)} ${spent.asset}, order needs ${spent.need}`,
      );
    }

    const now = Date.now();
    const order: Order = {
      id: `paper_${randomUUID()}`,
      clientOrderId: request_.clientOrderId,
      exchange: request_.exchange,
      kind: request_.kind,
      instrumentId: request_.instrumentId,
      symbol: spec.symbol,
      side: request_.side,
      status: "open",
      price: price.value,
      amount: amount.value,
      filledAmount: "0",
      averagePrice: null,
      filledValue: null,
      fee: null,
      feeAsset: null,
      createdAt: now,
      updatedAt: now,
      note: null,
    };

    this.repository.insertPaperOrder(order);

    // The quote side is reserved immediately, exactly as a real venue does, so
    // two orders cannot both be sized against the same money.
    if (request_.side === "buy") {
      this.repository.lockPaperBalance(
        request_.exchange,
        quoteAsset,
        "free",
        toPlainString(costed),
      );
    }

    // A paper order that the live book already satisfies fills at once.
    const filled = await this.tryFill(order);
    return filled ?? order;
  }

  /**
   * Checks one order against the live book and fills it if the price is there.
   *
   * Returns the updated order, or null when it should stay resting.
   */
  private async tryFill(order: Order): Promise<Order | null> {
    const venue = this.venueOf(order.exchange);
    const book = await venue.getOrderBook(order.symbol);
    if (!book) return null;

    const limit = parseDecimal(order.price);

    // A buy rests above the market and fills when a bid reaches the limit;
    // a sell rests below and fills when an ask reaches it.
    const touched =
      order.side === "buy"
        ? bestAtLeast(book.bids, limit)
        : bestAtMost(book.asks, limit);

    if (!touched) return null;

    const value = toPlainString(multiply(limit, parseDecimal(order.amount)));
    const filled: Order = {
      ...order,
      status: "filled",
      filledAmount: order.amount,
      averagePrice: order.price,
      filledValue: value,
      updatedAt: Date.now(),
    };

    const spec = this.specFor(order.exchange, order.instrumentId);

    this.repository.settlePaperFill(
      filled,
      { base: spec.baseAsset, quote: this.quoteAssetOf(spec) },
      value,
    );
    this.repository.updatePaperOrder(filled);
    this.repository.recordPaperTrade(
      filled.id,
      filled.side,
      filled.price,
      filled.amount,
    );

    return filled;
  }

  async cancelOrder(
    order: Pick<Order, "id" | "symbol" | "clientOrderId">,
  ): Promise<void> {
    const stored = this.repository.getPaperOrder(order.id);
    if (!stored) {
      // A cancel arriving for an unknown order is normal after a restart has
      // already reconciled it, so the venue id is not available here and the
      // caller is told which handle failed.
      throw new ExchangeError(
        "nobitex",
        "invalid_request",
        `no paper order with id ${order.id}`,
      );
    }
    if (stored.status === "filled") {
      throw new ExchangeError(
        stored.exchange,
        "invalid_request",
        "a filled order cannot be cancelled",
      );
    }

    // Release the reserved quote side so the operator can redeploy the money.
    const spec = this.specFor(stored.exchange, stored.instrumentId);
    if (stored.side === "buy") {
      const reserved = toPlainString(
        multiply(parseDecimal(stored.price), parseDecimal(stored.amount)),
      );
      this.repository.lockPaperBalance(
        stored.exchange,
        this.quoteAssetOf(spec),
        "locked",
        reserved,
      );
    }

    const cancelled: Order = {
      ...stored,
      status: "canceled",
      updatedAt: Date.now(),
    };
    this.repository.updatePaperOrder(cancelled);
  }

  async listOpenOrders(exchange: ExchangeId): Promise<Order[]> {
    return this.repository.listPaperOrders(exchange, true);
  }

  async listOrderHistory(
    exchange: ExchangeId,
    options: { limit?: number } = {},
  ): Promise<Order[]> {
    return this.repository
      .listPaperOrders(exchange, false)
      .slice(0, options.limit ?? 100);
  }

  async listTrades(exchange: ExchangeId): Promise<Trade[]> {
    return this.repository.listPaperOrders(exchange, false).flatMap((order) =>
      order.filledAmount === "0"
        ? []
        : [
            {
              id: `t_${order.id}`,
              orderId: order.id,
              exchange,
              instrumentId: order.instrumentId,
              symbol: order.symbol,
              side: order.side,
              price: order.averagePrice ?? order.price,
              amount: order.filledAmount,
              value:
                order.filledValue ??
                toPlainString(
                  multiply(
                    parseDecimal(order.averagePrice ?? order.price),
                    parseDecimal(order.filledAmount),
                  ),
                ),
              fee: null,
              feeAsset: null,
              tradedAt: order.updatedAt,
            } satisfies Trade,
          ],
    );
  }

  getBalances(exchange: ExchangeId): Balance[] {
    return this.repository.getPaperBalances(exchange);
  }

  /** Leverage is not simulated: paper covers spot fills only. */
  listPositions(): Promise<Position[]> {
    return Promise.resolve([]);
  }

  async closePosition(): Promise<Order> {
    throw ExchangeError.unsupported("nobitex", "paper leveraged positions");
  }

  session(exchange: ExchangeId, venue: ExchangeSession): ExchangeSession {
    return {
      ...venue,
      ready: true,
      note: env.TRADING_MODE === "paper" ? "paper trading" : venue.note,
    };
  }

  /**
   * Fills any resting paper order whose price the live book has reached.
   *
   * Called from the poll that already fetches boards, so simulation costs no
   * extra requests: the book is in hand either way.
   */
  async reconcile(exchange: ExchangeId): Promise<Order[]> {
    const resting = this.repository.listPaperOrders(exchange, true);
    const filled: Order[] = [];

    for (const order of resting) {
      const done = await this.tryFill(order);
      if (done) filled.push(done);
    }

    return filled;
  }
}

function bestAtLeast(
  levels: [string, string][],
  limit: ReturnType<typeof parseDecimal>,
): boolean {
  for (const [price] of levels) {
    if (compare(parseDecimal(price), limit) >= 0) return true;
  }
  return false;
}

function bestAtMost(
  levels: [string, string][],
  limit: ReturnType<typeof parseDecimal>,
): boolean {
  for (const [price] of levels) {
    if (compare(parseDecimal(price), limit) <= 0) return true;
  }
  return false;
}
