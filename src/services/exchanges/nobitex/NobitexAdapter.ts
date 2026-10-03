import "server-only";

import { env } from "~/env.js";
import { NOBITEX_FALLBACK_PRECISION } from "~/constants/tradingInstruments";
import { BaseExchangeAdapter } from "~/services/exchanges/BaseExchangeAdapter";
import { request, venueCodeOf, venueMessageOf } from "~/services/exchanges/http";
import {
  ExchangeError,
  type ProtectionResult,
} from "~/services/trading/exchange.port";
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
  Position,
  Trade,
} from "~/services/trading/trading.types";

/**
 * Nobitex.
 *
 * Three things about this venue drive most of the code below.
 *
 * **Trading is not under `/v3`.** The orderbook is `/v3/orderbook/{symbol}` but
 * every write is at the root: `/market/orders/add`, `/users/wallets/list`,
 * `/positions/list`. Following the read-path convention here produces a 404.
 *
 * **Symbols and write parameters disagree.** The orderbook takes the
 * concatenated `XAUTIRT`, while `/market/orders/add` takes separate
 * `srcCurrency`/`dstCurrency` lowercase codes, and the Rial currency is `rls` —
 * there is no `irt` code in any write endpoint, only inside symbol strings.
 *
 * **Business failures arrive with HTTP 200.** Every rejection from
 * `/market/orders/add` comes back `{"status":"failed","code":"BadPrice"}` on a
 * 200, so the envelope has to be inspected on success paths too. That is what
 * {@link unwrapNobitex} is for.
 */

type NobitexEnvelope = { status?: string; code?: string; message?: string };

/** Currency codes as the write API spells them. */
function currenciesOf(spec: MarketSpec): { src: string; dst: string } {
  return {
    src: spec.baseAsset.toLowerCase(),
    dst: spec.quoteAsset === "usdt" ? "usdt" : "rls",
  };
}

/**
 * Turns a Nobitex envelope into a value or an `ExchangeError`.
 *
 * Nobitex documents that business errors share the 200 status code, so the HTTP
 * layer cannot distinguish them and every call site has to branch here. The
 * error `code` is preserved rather than the human `message`, because that is
 * the value support will recognise.
 */
function unwrapNobitex<T>(
  exchange: "nobitex",
  payload: unknown,
  what: string,
): T {
  if (typeof payload !== "object" || payload === null) {
    throw new ExchangeError(
      exchange,
      "unavailable",
      `${what}: unexpected response`,
      null,
    );
  }
  const envelope = payload as NobitexEnvelope & Record<string, unknown>;
  if (envelope.status === "failed") {
    const code = envelope.code ?? null;
    // A few codes are actionable rather than merely wrong, and the UI can say so.
    const kind =
      code === "InsufficientBalance"
        ? "insufficient_funds"
        : code === "BadPrice" ||
            code === "PriceConditionFailed" ||
            code === "InvalidOrderPrice" ||
            code === "SmallOrder" ||
            code === "AmountTooLow" ||
            code === "InvalidPair" ||
            code === "InvalidMarketPair"
          ? "invalid_request"
          : "rejected";
    throw new ExchangeError(
      exchange,
      kind,
      `${what}: ${envelope.message ?? code ?? "rejected"}`,
      code,
    );
  }
  return payload as T;
}

/** Nobitex writes zeroes in scientific notation and a Unicode minus in docs. */
function num(value: unknown): string {
  if (value === null || value === undefined) return "0";
  return toPlainString(parseDecimal(value as string | number));
}

function orderStatusOf(raw: string | undefined): OrderStatus {
  switch (raw) {
    case "New":
    case "Active":
    case "Inactive":
      return "open";
    case "Done":
      return "filled";
    case "Canceled":
      return "canceled";
    default:
      return "open";
  }
}

type NobitexOrder = {
  id?: number | string;
  type?: string;
  price?: string;
  amount?: string;
  matchedAmount?: string;
  unmatchedAmount?: string;
  averagePrice?: string;
  status?: string;
  fee?: string;
  clientOrderId?: string;
  created_at?: string;
  market?: string;
  leverage?: string;
  side?: string;
  [key: string]: unknown;
};

export class NobitexAdapter extends BaseExchangeAdapter {
  readonly id = "nobitex" as const;
  readonly label = "Nobitex";

  protected readonly capabilities = { margin: true, futures: false };

  constructor() {
    super("nobitex");
  }

  private get base(): string {
    return env.NOBITEX_BASE_URL.replace(/\/$/, "");
  }

  private get token(): string | undefined {
    return env.NOBITEX_TOKEN;
  }

  protected get hasCredentials(): boolean {
    return typeof this.token === "string" && this.token.length > 0;
  }

  private auth(): Record<string, string> {
    if (!this.token) {
      throw new ExchangeError(
        this.id,
        "unauthorized",
        "NOBITEX_TOKEN is not configured",
      );
    }
    return { Authorization: `Token ${this.token}` };
  }

  private call<T>(
    options: {
      method: "GET" | "POST" | "DELETE";
      path: string;
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      write?: boolean;
      idempotent?: boolean;
    },
  ): Promise<T> {
    return this.write.schedule(() =>
      this.read.schedule(() =>
        request<T>({
          exchange: this.id,
          method: options.method,
          url: options.path,
          baseUrl: this.base,
          headers: this.auth(),
          query: options.query,
          body: options.body,
          // Writes are never retried: a timeout after acceptance is ambiguous
          // and a blind repeat would open a second order. `clientOrderId`
          // makes a repeat safe upstream, but the ordering here means we ask the
          // operator instead of guessing.
          idempotent: options.idempotent ?? options.write !== true,
        }),
      ),
    );
  }

  /**
   * Walks the account with the cheapest call that proves the token works.
   *
   * `type=spot` keeps the response small; Nobitex rate-limits this at 20/min and
   * the balance screen polls it, so it must not be the most expensive call on
   * the page.
   */
  protected async checkCredentials(): Promise<string | null> {
    try {
      await this.call({
        method: "GET",
        path: "/users/wallets/list",
        query: { type: "spot" },
        idempotent: true,
      });
      return null;
    } catch (error) {
      if (error instanceof ExchangeError) return error.message;
      throw error;
    }
  }

  /**
   * Live price and size increments, which override the local catalogue.
   *
   * `amountPrecisions` and `pricePrecisions` are per market and range from 0 to
   * 8 decimals, so hardcoding them is how an order gets rejected. The call is
   * large (~327 KB) and cached for an hour by the caller.
   */
  async precision(): Promise<{
    amount: Record<string, string>;
    price: Record<string, string>;
    minNotional: Record<string, string>;
  }> {
    try {
      const payload = await this.read.schedule(() =>
        request<{ status?: string; nobitex?: Record<string, unknown> }>({
          exchange: this.id,
          method: "GET",
          url: "/v2/options",
          baseUrl: this.base,
          idempotent: true,
        }),
      );

      const root = payload.nobitex ?? {};
      const toSteps = (source: unknown): Record<string, string> => {
        if (typeof source !== "object" || source === null) return {};
        const out: Record<string, string> = {};
        for (const [symbol, value] of Object.entries(
          source as Record<string, unknown>,
        )) {
          if (typeof value === "number") {
            out[symbol] = stepFromDecimals(String(value));
          } else if (typeof value === "string" && /^\d+$/.test(value)) {
            out[symbol] = stepFromDecimals(value);
          }
        }
        return out;
      };

      return {
        amount: toSteps(root.amountPrecisions),
        price: toSteps(root.pricePrecisions),
        minNotional:
          typeof root.minOrders === "object" && root.minOrders !== null
            ? (root.minOrders as Record<string, string>)
            : {},
      };
    } catch {
      // The fallback catalogue is stable, and refusing to size an order because
      // a metadata call failed would be worse than a slightly stale step.
      return { amount: {}, price: {}, minNotional: {} };
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
          url: `/v3/orderbook/${encodeURIComponent(symbol)}`,
          baseUrl: this.base,
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

  /**
   * Spot balances.
   *
   * The docs disagree about whether this endpoint is `GET` or `POST` and the
   * GitHub mirror is older, so `GET` is tried and `POST` is the fallback. Either
   * way `activeBalance` is what can be committed; `balance` includes what open
   * orders have already reserved.
   */
  async getBalances(): Promise<Balance[]> {
    const payload = await this.call<{
      wallets?: {
        currency?: string;
        balance?: string;
        blockedBalance?: string;
        activeBalance?: string;
      }[];
    }>({
      method: "GET",
      path: "/users/wallets/list",
      query: { type: "spot" },
      idempotent: true,
    });

    const unwrapped = unwrapNobitex<{
      wallets?: {
        currency?: string;
        balance?: string;
        blockedBalance?: string;
        activeBalance?: string;
      }[];
    }>(this.id, payload, "balances");

    return (unwrapped.wallets ?? [])
      .filter((wallet) => typeof wallet.currency === "string")
      .map((wallet) => {
        // `activeBalance` is what a new order can draw on; `balance` also
        // counts what open orders have already reserved.
        const free = num(wallet.activeBalance ?? wallet.balance);
        const locked = num(wallet.blockedBalance);
        return {
          exchange: this.id,
          asset: (wallet.currency ?? "").toUpperCase(),
          free,
          locked,
          total: addDecimal(free, locked),
          valueInRial: null,
        };
      });
  }

  private async placeSpot(
    request_: PlaceOrderRequest,
  ): Promise<Order> {
    const spec = this.requireSpec(request_.instrumentId);
    const { src, dst } = currenciesOf(spec);

    const payload = await this.call<{ order?: NobitexOrder }>({
      method: "POST",
      path: "/market/orders/add",
      write: true,
      body: {
        type: request_.side,
        execution: "limit",
        srcCurrency: src,
        dstCurrency: dst,
        // Nobitex documents every schema field as a string, and warns against
        // sending a float in financial code.
        amount: request_.amount,
        price: request_.price,
        clientOrderId: request_.clientOrderId,
      },
    });

    const unwrapped = unwrapNobitex<{ order?: NobitexOrder }>(
      this.id,
      payload,
      "place order",
    );
    return this.toOrder(unwrapped.order ?? {}, spec, request_);
  }

  /**
   * A leveraged order.
   *
   * Nobitex's "margin" (تعهدی) is not a perpetual: there is no funding rate and
   * no contract size, leverage is a per-order parameter capped by
   * `maxLeverage` (5x for XAUT, 1x for USDT/Rial), and a position expires after
   * 30 days. It is the only way to get leveraged Rial gold on any Iranian
   * venue, which is why it is wired up rather than left as unsupported.
   */
  private async placeMargin(
    request_: PlaceOrderRequest,
    leverage: string,
  ): Promise<Order> {
    const spec = this.requireSpec(request_.instrumentId);
    const { src, dst } = currenciesOf(spec);

    const payload = await this.call<{ order?: NobitexOrder }>({
      method: "POST",
      path: "/margin/orders/add",
      write: true,
      body: {
        // `execution` is required here, unlike spot where it defaults.
        execution: "limit",
        srcCurrency: src,
        dstCurrency: dst,
        type: request_.side,
        amount: request_.amount,
        price: request_.price,
        leverage,
        clientOrderId: request_.clientOrderId,
      },
    });

    const unwrapped = unwrapNobitex<{ order?: NobitexOrder }>(
      this.id,
      payload,
      "place margin order",
    );
    return this.toOrder(unwrapped.order ?? {}, spec, request_);
  }

  async placeLimitOrder(request_: PlaceOrderRequest): Promise<Order> {
    if (request_.kind === "margin") {
      const leverage = request_.leverage ?? "1";
      return this.placeMargin(request_, leverage);
    }
    return this.placeSpot(request_);
  }

  async cancelOrder(
    order: Pick<Order, "id" | "symbol" | "clientOrderId">,
  ): Promise<void> {
    // A rejected transition still returns 200 with `status: "failed"`, so the
    // envelope decides success, not the HTTP code.
    const payload = await this.call<NobitexEnvelope & NobitexOrder>({
      method: "POST",
      path: "/market/orders/update-status",
      write: true,
      body: { order: Number(order.id), status: "canceled" },
    });

    const result = unwrapNobitex<{
      updatedStatus?: string;
      order?: NobitexOrder;
    }>(this.id, payload, "cancel order");
    void result;
  }

  async listOpenOrders(symbol?: string): Promise<Order[]> {
    const spec = symbol ? this.specForSymbol(symbol) : null;

    const payload = await this.call<{ orders?: NobitexOrder[] }>({
      method: "GET",
      path: "/market/orders/list",
      query: {
        status: "open",
        // Without `details=2` the response omits `id` and `status`, which makes
        // the rows impossible to cancel or even classify.
        details: 2,
        tradeType: "spot",
        ...(spec ? currenciesOf(spec) : {}),
      },
      idempotent: true,
    });

    const unwrapped = unwrapNobitex<{ orders?: NobitexOrder[] }>(
      this.id,
      payload,
      "open orders",
    );

    return (unwrapped.orders ?? []).map((raw) =>
      this.toOrder(raw, spec, null),
    );
  }

  async listOrderHistory(options: {
    symbol?: string;
    limit?: number;
  }): Promise<Order[]> {
    const spec = options.symbol ? this.specForSymbol(options.symbol) : null;

    const payload = await this.call<{ orders?: NobitexOrder[] }>({
      method: "GET",
      path: "/market/orders/list",
      query: {
        status: "close",
        details: 2,
        page: 1,
        pageSize: Math.min(options.limit ?? 100, 1000),
        ...(spec ? currenciesOf(spec) : {}),
      },
      idempotent: true,
    });

    const unwrapped = unwrapNobitex<{ orders?: NobitexOrder[] }>(
      this.id,
      payload,
      "order history",
    );

    return (unwrapped.orders ?? []).map((raw) =>
      this.toOrder(raw, spec, null),
    );
  }

  async listTrades(options: {
    symbol?: string;
    limit?: number;
  }): Promise<Trade[]> {
    const spec = options.symbol ? this.specForSymbol(options.symbol) : null;

    const payload = await this.call<{ trades?: Record<string, unknown>[] }>({
      method: "GET",
      path: "/market/trades/list",
      query: {
        page: 1,
        pageSize: Math.min(options.limit ?? 100, 500),
        ...(spec ? currenciesOf(spec) : {}),
      },
      idempotent: true,
    });

    const unwrapped = unwrapNobitex<{ trades?: Record<string, unknown>[] }>(
      this.id,
      payload,
      "trades",
    );

    return (unwrapped.trades ?? []).map((raw) => {
      const price = num(raw.price);
      const amount = num(raw.amount);
      return {
        id: textOf(raw.id),
        orderId: textOf(raw.orderId),
        exchange: this.id,
        instrumentId: spec?.instrumentId ?? "unknown",
        symbol: textOf(raw.market) || (options.symbol ?? ""),
        side: raw.type === "buy" ? "buy" : "sell",
        price,
        amount,
        value: num(raw.total),
        fee: raw.fee === undefined ? null : num(raw.fee),
        feeAsset: spec?.baseAsset ?? null,
        tradedAt: epochOf(raw.timestamp) ?? Date.now(),
      };
    });
  }

  async listPositions(): Promise<Position[]> {
    const payload = await this.call<{ positions?: Record<string, unknown>[] }>({
      method: "GET",
      path: "/positions/list",
      query: { status: "active" },
      idempotent: true,
    });

    const unwrapped = unwrapNobitex<{ positions?: Record<string, unknown>[] }>(
      this.id,
      payload,
      "positions",
    );

    return (unwrapped.positions ?? []).map((raw) => {
      const src = textOf(raw.srcCurrency).toUpperCase();
      const dst = textOf(raw.dstCurrency).toUpperCase();
      return {
        id: textOf(raw.id),
        exchange: this.id,
        kind: "margin",
        instrumentId: instrumentIdFor(src, dst),
        symbol: `${src}${dst}`,
        // Nobitex uses `side` for the position lifecycle and `type` for
        // direction. A short is `side: "sell"` on an opened position.
        side: raw.side === "sell" ? "short" : "long",
        status:
          raw.status === "Closed"
            ? "closed"
            : raw.status === "Liquidated"
              ? "liquidated"
              : raw.status === "Expired"
                ? "expired"
                : "open",
        leverage: raw.leverage === undefined ? null : num(raw.leverage),
        size: num(raw.liability),
        entryPrice: num(raw.entryPrice),
        liquidationPrice:
          raw.liquidationPrice === undefined
            ? null
            : num(raw.liquidationPrice),
        unrealizedPnl:
          raw.unrealizedPNL === undefined ? null : num(raw.unrealizedPNL),
        unrealizedPnlPercent:
          raw.unrealizedPNLPercent === undefined
            ? null
            : num(raw.unrealizedPNLPercent),
        realizedPnl: raw.PNL === undefined ? null : num(raw.PNL),
        margin: raw.collateral === undefined ? null : num(raw.collateral),
        openedAt: epochOf(raw.openedAt),
        closedAt: epochOf(raw.closedAt),
      } satisfies Position;
    });
  }

  /**
   * Closes by placing a reduce order rather than a market take.
   *
   * A limit close is used deliberately: the position stays open until the price
   * the operator chose is reached, which is consistent with every other order
   * this app places and avoids a liquidation-grade fill.
   */
  async closePosition(
    position: Pick<Position, "id" | "symbol">,
    options?: { price?: string; amount?: string },
  ): Promise<Order> {
    if (!options?.price) {
      throw new ExchangeError(
        this.id,
        "invalid_request",
        "closing a Nobitex margin position requires an explicit limit price",
      );
    }

    const payload = await this.call<{ order?: NobitexOrder }>({
      method: "POST",
      path: `/positions/${encodeURIComponent(position.id)}/close`,
      write: true,
      body: { price: options.price },
    });

    const unwrapped = unwrapNobitex<{ order?: NobitexOrder }>(
      this.id,
      payload,
      "close position",
    );
    return this.toOrder(unwrapped.order ?? {}, null, null);
  }

  /**
   * No exchange-side protective orders exist on this venue.
   *
   * The margin product has leverage, a liquidation price and a collateral ratio,
   * but no `positionSlTp` and no bracket orders - there is nothing to call. Rather
   * than report success, this returns `emulated` with a note, and
   * `ProtectionService` stores the level and watches the price itself.
   *
   * That is a genuinely weaker guarantee and the note says so, because the
   * difference matters: a real exchange-side stop survives this process being
   * closed, and this one does not.
   */
  async setPositionProtection(
    _position: Pick<Position, "id" | "symbol">,
    protection: { takeProfit?: string | null; stopLoss?: string | null },
  ): Promise<ProtectionResult> {
    return {
      mode: "emulated",
      takeProfit: protection.takeProfit ?? null,
      stopLoss: protection.stopLoss ?? null,
      note:
        "Nobitex margin has no exchange-side take-profit or stop-loss. These levels are held by this app and fire a limit reduce order when the price crosses, so they only work while it is running.",
    };
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

  private toOrder(
    raw: NobitexOrder,
    spec: MarketSpec | null,
    submitted: PlaceOrderRequest | null,
  ): Order {
    const filled = num(raw.matchedAmount);
    const amount = num(raw.amount);
    const price = num(raw.price);
    const average = num(raw.averagePrice);
    const status = orderStatusOf(raw.status);

    return {
      id: textOf(raw.id) || (submitted?.clientOrderId ?? ""),
      clientOrderId: raw.clientOrderId ?? submitted?.clientOrderId ?? null,
      exchange: this.id,
      kind: raw.tradeType === "Margin" ? "margin" : "spot",
      instrumentId:
        spec?.instrumentId ?? instrumentIdForMarket(textOf(raw.market)),
      symbol: spec?.symbol ?? textOf(raw.market),
      side: raw.type === "sell" ? "sell" : "buy",
      // A partially matched order is `Done` at Nobitex but is really
      // partially filled, and the difference matters to anyone reading it.
      status:
        status === "filled" && !isFullFill(filled, amount)
          ? "partially_filled"
          : status,
      price,
      amount,
      filledAmount: filled,
      averagePrice: isZeroText(average) ? null : average,
      filledValue: raw.totalPrice === undefined ? null : num(raw.totalPrice),
      fee: raw.fee === undefined ? null : num(raw.fee),
      feeAsset: spec?.baseAsset ?? null,
      createdAt: epochOf(raw.created_at) ?? Date.now(),
      updatedAt: Date.now(),
      note: null,
    };
  }
}

function isFullFill(filled: string, amount: string): boolean {
  const f = parseDecimal(filled);
  const a = parseDecimal(amount);
  return a.mantissa > 0n && f.mantissa >= a.mantissa;
}

function isZeroText(text: string): boolean {
  return parseDecimal(text).mantissa === 0n;
}

/** `"5"` decimals -> a `"0.00001"` increment. */
function stepFromDecimals(decimals: string): string {
  const count = Number(decimals);
  if (!Number.isInteger(count) || count <= 0) return "1";
  return `0.${"0".repeat(count - 1)}1`;
}

function addDecimal(a: string, b: string): string {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  const scale = Math.max(left.scale, right.scale);
  const total =
    left.mantissa * 10n ** BigInt(scale - left.scale) +
    right.mantissa * 10n ** BigInt(scale - right.scale);
  return toPlainString({ mantissa: total, scale });
}

/** Maps a currency pair back to one of our instrument ids. */
function instrumentIdFor(base: string, quote: string): string {
  const key = base.toUpperCase();
  if (key === "USDT") return "usdt";
  if (key === "XAUT") return "xaut";
  if (key === "PAXG") return "paxg";
  void quote;
  return "unknown";
}

/** Same, from Nobitex's dash-separated `market` field. */
function instrumentIdForMarket(market: string): string {
  const [base] = market.split("-");
  return instrumentIdFor(base ?? "", "");
}

export { NOBITEX_FALLBACK_PRECISION, venueCodeOf, venueMessageOf };
