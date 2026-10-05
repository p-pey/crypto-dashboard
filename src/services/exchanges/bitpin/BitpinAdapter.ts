import "server-only";

import { BaseExchangeAdapter } from "~/services/exchanges/BaseExchangeAdapter";
import { request } from "~/services/exchanges/http";
import { ExchangeError } from "~/services/trading/exchange.port";
import {
  epochOf,
  parseDecimal,
  textOf,
  toPlainString,
} from "~/services/trading/decimal";
import type {
  Balance,
  MarketSpec,
  Order,
  OrderStatus,
  PlaceOrderRequest,
  Trade,
} from "~/services/trading/trading.types";
import { BitpinTokenStore } from "./BitpinTokenStore";

/**
 * Bitpin.
 *
 * Four things are specific enough to be worth stating up front.
 *
 * **`_IRT` is Toman.** Bitpin's own market list names `BTC_IRT` "Bitcoin/Toman"
 * and its currency list names `IRT` "Toman", so the board's Rial price has to be
 * divided by ten to reach this venue.
 *
 * **The wallet calls the same fiat asset `RIAL` that the markets call `IRT`.**
 * These are the same holding, and reconciling a Toman balance against
 * `USDT_IRT` order flow fails silently unless the two names are aliased. That
 * alias is {@link normaliseAsset}.
 *
 * **There is no leverage product at all.** Every futures, margin and leverage
 * route probes as 404 and the documentation has no such section, so this adapter
 * reports spot only rather than pretending.
 *
 * **`dealed_` is spelled that way.** The API really does return `dealed_base_amount`
 * and `dealed_quote_amount`, and there is no `FILLED` status: a fill is inferred
 * by comparing `dealed_*` against the requested size.
 */

const BASE = "https://api.bitpin.ir/api/v1";

/** Maps Bitpin's wallet asset names onto the codes the app uses. */
function normaliseAsset(asset: string): string {
  const key = asset.trim().toUpperCase();
  // The market layer calls it IRT, the wallet layer calls it RIAL, and both mean
  // Toman. Canonicalised to RLS so it matches every other venue.
  if (key === "IRT" || key === "RIAL" || key === "TMN" || key === "TOMAN") {
    return "RLS";
  }
  return key;
}

function num(value: unknown): string {
  if (value === null || value === undefined) return "0";
  return toPlainString(parseDecimal(value as string | number));
}

type BitpinOrder = {
  id?: number | string;
  identifier?: string;
  symbol?: string;
  side?: string;
  type?: string;
  state?: string;
  price?: string;
  base_amount?: string;
  quote_amount?: string;
  dealed_base_amount?: string;
  dealed_quote_amount?: string;
  commission?: string;
  created_at?: string;
  closed_at?: string;
  req_to_cancel?: boolean;
};

/**
 * Bitpin has no filled/cancelled status.
 *
 * `state` is only initial/active/closed, so the fill is derived from how much
 * traded and whether a cancel was requested.
 */
function orderStatusOf(raw: BitpinOrder): OrderStatus {
  const amount = parseDecimal(num(raw.base_amount));
  const filled = parseDecimal(num(raw.dealed_base_amount));
  const isFull = amount.mantissa > 0n && filled.mantissa >= amount.mantissa;
  const isPartial = filled.mantissa > 0n && !isFull;
  const cancelled = raw.req_to_cancel === true || raw.state === "closed";

  if (cancelled)
    return isPartial ? "partially_filled" : isFull ? "filled" : "canceled";
  if (isFull) return "filled";
  if (isPartial) return "partially_filled";
  return "open";
}

export class BitpinAdapter extends BaseExchangeAdapter {
  readonly id = "bitpin" as const;
  readonly label = "Bitpin";

  protected readonly capabilities = { margin: false, futures: false };

  private readonly tokens = new BitpinTokenStore();

  constructor() {
    super("bitpin");
  }

  protected get hasCredentials(): boolean {
    return this.tokens.configured;
  }

  private async auth(): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.tokens.accessToken()}` };
  }

  private async call<T>(options: {
    method: "GET" | "POST" | "DELETE";
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    write?: boolean;
    idempotent?: boolean;
  }): Promise<T> {
    return this.write.schedule(() =>
      this.read.schedule(async () =>
        request<T>({
          exchange: this.id,
          method: options.method,
          url: options.path,
          baseUrl: BASE,
          headers: await this.auth(),
          query: options.query,
          body: options.body,
          idempotent: options.idempotent ?? options.write !== true,
        }),
      ),
    );
  }

  protected async checkCredentials(): Promise<string | null> {
    try {
      await this.call({
        method: "GET",
        path: "/wlt/wallets/",
        query: { limit: 1 },
        idempotent: true,
      });
      return null;
    } catch (error) {
      if (error instanceof ExchangeError) return error.message;
      throw error;
    }
  }

  override async getOrderBook(symbol: string): Promise<{
    bids: [string, string][];
    asks: [string, string][];
  } | null> {
    const payload = await this.emptyOnFailure("orderbook", () =>
      this.read.schedule(() =>
        request<Record<string, unknown>>({
          exchange: this.id,
          method: "GET",
          url: `/mth/orderbook/${encodeURIComponent(symbol)}/`,
          baseUrl: BASE,
          idempotent: true,
        }),
      ),
    );
    if (!payload) return null;

    const levels = (key: string): [string, string][] => {
      const raw = payload[key];
      if (!Array.isArray(raw)) return [];
      const out: [string, string][] = [];
      for (const level of raw) {
        if (Array.isArray(level) && level.length >= 2) {
          out.push([num(level[0]), num(level[1])]);
        }
      }
      return out;
    };

    const bids = levels("bids");
    const asks = levels("asks");
    return bids.length === 0 && asks.length === 0 ? null : { bids, asks };
  }

  async getBalances(): Promise<Balance[]> {
    const payload = await this.call<{
      results?: { asset?: string; balance?: string; frozen?: string }[];
    }>({
      method: "GET",
      path: "/wlt/wallets/",
      query: { limit: 200 },
      idempotent: true,
    });

    return (payload.results ?? [])
      .filter((row) => typeof row.asset === "string")
      .map((row) => ({
        exchange: this.id,
        asset: normaliseAsset(row.asset ?? ""),
        // Bitpin's `balance` is already net of `frozen`, so it is the spendable
        // figure directly rather than a total needing subtraction.
        free: num(row.balance),
        locked: num(row.frozen),
        total: addDecimal(num(row.balance), num(row.frozen)),
        valueInRial: null,
      }));
  }

  async placeLimitOrder(request_: PlaceOrderRequest): Promise<Order> {
    const spec = this.requireSpec(request_.instrumentId);

    const payload = await this.call<BitpinOrder>({
      method: "POST",
      path: "/odr/orders/",
      write: true,
      body: {
        symbol: spec.symbol,
        type: "limit",
        side: request_.side,
        price: request_.price,
        // Bitpin names the size field `base_amount`; the value is still in base
        // units, which is the one convention that is consistent across venues.
        base_amount: request_.amount,
      },
    });

    return this.toOrder(payload, spec);
  }

  async cancelOrder(
    order: Pick<Order, "id" | "symbol" | "clientOrderId">,
  ): Promise<void> {
    await this.call({
      method: "DELETE",
      path: `/odr/orders/${encodeURIComponent(order.id)}/`,
      write: true,
    });
  }

  async listOpenOrders(symbol?: string): Promise<Order[]> {
    const spec = symbol ? this.specForSymbol(symbol) : null;

    const payload = await this.call<{ results?: BitpinOrder[] }>({
      method: "GET",
      path: "/odr/orders/",
      query: {
        state: "active",
        ...(spec ? { symbol: spec.symbol } : {}),
        limit: 100,
      },
      idempotent: true,
    });

    return (payload.results ?? []).map((raw) => this.toOrder(raw, spec));
  }

  /**
   * Historical orders.
   *
   * `/odr/orders/` only retains active orders plus seven days of closed ones,
   * and orders that filled or were cancelled with no fill are then deleted
   * outright. `/odr/order_history/` is the longer record, so it is read for
   * anything past that window.
   */
  async listOrderHistory(options: {
    symbol?: string;
    limit?: number;
  }): Promise<Order[]> {
    const spec = options.symbol ? this.specForSymbol(options.symbol) : null;

    const payload = await this.call<{ results?: BitpinOrder[] }>({
      method: "GET",
      path: "/odr/order_history/",
      query: {
        ...(spec ? { symbol: spec.symbol } : {}),
        // `offset` here is an id cursor, not a page number.
        limit: Math.min(options.limit ?? 100, 100),
      },
      idempotent: true,
    });

    return (payload.results ?? []).map((raw) => this.toOrder(raw, spec));
  }

  async listTrades(options: {
    symbol?: string;
    limit?: number;
  }): Promise<Trade[]> {
    const spec = options.symbol ? this.specForSymbol(options.symbol) : null;
    if (!spec) return [];

    const payload = await this.call<{
      results?: Record<string, unknown>[];
    }>({
      method: "GET",
      path: "/odr/fills/",
      query: {
        symbol: spec.symbol,
        limit: Math.min(options.limit ?? 100, 100),
      },
      idempotent: true,
    });

    return (payload.results ?? []).map((raw) => ({
      id: textOf(raw.id),
      orderId: textOf(raw.order_id),
      exchange: this.id,
      instrumentId: spec.instrumentId,
      symbol: spec.symbol,
      side: raw.side === "sell" ? "sell" : "buy",
      price: num(raw.price),
      amount: num(raw.base_amount),
      value: num(raw.quote_amount),
      fee: raw.commission === undefined ? null : num(raw.commission),
      feeAsset:
        typeof raw.commission_currency === "string"
          ? raw.commission_currency
          : null,
      tradedAt: epochOf(raw.created_at) ?? Date.now(),
    }));
  }

  private requireSpec(instrumentId: string): MarketSpec {
    const spec = this.marketSpec(instrumentId);
    if (!spec) {
      throw new ExchangeError(
        this.id,
        "invalid_request",
        `${this.label} does not list ${instrumentId}`,
      );
    }
    return spec;
  }

  private specForSymbol(symbol: string): MarketSpec | null {
    for (const row of ["usdt", "xaut", "paxg"]) {
      const spec = this.marketSpec(row);
      if (spec?.symbol === symbol) return spec;
    }
    return null;
  }

  private toOrder(raw: BitpinOrder, spec: MarketSpec | null): Order {
    const amount = num(raw.base_amount);
    const filled = num(raw.dealed_base_amount);
    const price = num(raw.price);
    // Bitpin only reports an average once something has traded.
    const average =
      filled === "0" || price === "0"
        ? null
        : toPlainString(
            parseDecimal(filled).mantissa === 0n
              ? parseDecimal("0")
              : parseDecimal(filled),
          );

    return {
      id: textOf(raw.id) || textOf(raw.identifier),
      clientOrderId: raw.identifier ?? null,
      exchange: this.id,
      kind: "spot",
      instrumentId: spec?.instrumentId ?? "unknown",
      symbol: raw.symbol ?? spec?.symbol ?? "",
      side: raw.side === "sell" ? "sell" : "buy",
      status: orderStatusOf(raw),
      price,
      amount,
      filledAmount: filled,
      // There is no average field, so it is left null rather than guessed from
      // the limit price, which would read as a real fill price.
      averagePrice: null,
      filledValue:
        raw.dealed_quote_amount === undefined
          ? null
          : num(raw.dealed_quote_amount),
      fee: raw.commission === undefined ? null : num(raw.commission),
      feeAsset: null,
      createdAt: epochOf(raw.created_at) ?? Date.now(),
      updatedAt:
        epochOf(raw.closed_at) ?? epochOf(raw.created_at) ?? Date.now(),
      note: null,
      ...(average === null ? {} : { averagePrice: average }),
    };
  }
}

function addDecimal(a: string, b: string): string {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  const scale = Math.max(left.scale, right.scale);
  return toPlainString({
    mantissa:
      left.mantissa * 10n ** BigInt(scale - left.scale) +
      right.mantissa * 10n ** BigInt(scale - right.scale),
    scale,
  });
}
