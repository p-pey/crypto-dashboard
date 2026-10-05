import "server-only";

import { createHmac } from "node:crypto";

import { env } from "~/env.js";
import { BaseExchangeAdapter } from "~/services/exchanges/BaseExchangeAdapter";
import { request } from "~/services/exchanges/http";
import {
  ExchangeError,
  type ProtectionResult,
} from "~/services/trading/exchange.port";
import {
  parseDecimal,
  textOf,
  toPlainString,
} from "~/services/trading/decimal";
import type {
  Balance,
  MarketSpec,
  Order,
  OrderKind,
  OrderStatus,
  PlaceOrderRequest,
  Position,
  Trade,
} from "~/services/trading/trading.types";

/**
 * Tabdeal.
 *
 * Tabdeal is a Binance fork, which is helpful: the payloads, the
 * `X-MBX-APIKEY` header, the `{code, msg}` error envelope and the `listenKey`
 * user-stream pattern are all familiar. It is not identical, and the
 * differences are what this adapter is built around.
 *
 * **The `/r` path prefix is inconsistent in the documentation.** The docs show
 * writes on `/api/v1/...` and reads on `/r/api/v1/...`. Both were verified to
 * work for every method, so one prefix is used throughout rather than two code
 * paths.
 *
 * **The signature covers a query string, not a body.** Every parameter,
 * including `timestamp` in milliseconds, is serialised as
 * `key=value&key=value` in insertion order and HMAC-SHA256'd with the secret.
 * A skewed clock produces error 1101 on every order, so server time is measured
 * once at startup and reused.
 *
 * **It is the only Iranian venue with perpetuals**, and gold is on them:
 * `XAUT_USDT` and `PAXG_USDT` both trade on FAPI. There is no Rial-settled gold
 * future, because a leveraged Rial market needs someone warehousing the risk.
 */

const SPOT_BASE = "https://api1.tabdeal.org/r/api/v1";
const FUTURES_BASE = "https://api1.tabdeal.org/r/fapi/v1";

/** Tabdeal documents no rate limits, so the pacer is the only brake there is. */
const DEFAULT_RECV_WINDOW_MS = 5000;

function num(value: unknown): string {
  if (value === null || value === undefined) return "0";
  return toPlainString(parseDecimal(value as string | number));
}

type TabdealErrorBody = { code?: number | string; msg?: string };

/**
 * Tabdeal reports business failures through `code` in the body, and its
 * documented codes are numeric strings.
 */
function raiseTabdeal(
  exchange: "tabdeal",
  payload: unknown,
  what: string,
): never {
  const bag = (payload ?? {}) as TabdealErrorBody;
  const code = bag.code === undefined ? null : String(bag.code);
  const message = bag.msg ?? `${what} failed`;

  // The codes worth acting on differ from the rest.
  const kind =
    code === "1100" || code === "1101" || code === "1102"
      ? "unauthorized"
      : code === "-2010" || code === "-2011" || code === "-2013"
        ? "insufficient_funds"
        : code === "-1003" || code === "1216"
          ? "rate_limited"
          : code === "1213"
            ? "invalid_request"
            : "rejected";

  throw new ExchangeError(exchange, kind, `${what}: ${message}`, code);
}

function isTabdealFailure(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const code = (payload as TabdealErrorBody).code;
  // Success carries no `code` at all on these routes.
  return code !== undefined && code !== null;
}

/** Binance-family status words, mapped onto the app's lifecycle. */
function orderStatusOf(raw: string | undefined): OrderStatus {
  switch (raw) {
    case "NEW":
      return "open";
    case "PARTIALLY_FILLED":
      return "partially_filled";
    case "FILLED":
      return "filled";
    case "CANCELED":
      return "canceled";
    case "PENDING_CANCEL":
    case "EXPIRED":
      return "expired";
    case "REJECTED":
      return "rejected";
    default:
      return "open";
  }
}

type TabdealOrder = {
  orderId?: number | string;
  clientOrderId?: string;
  tabdealSymbol?: string;
  symbol?: string;
  side?: string;
  type?: string;
  price?: string;
  origQty?: string;
  executedQty?: string;
  cummulativeQuoteQty?: string;
  cumulativeQuoteQty?: string;
  status?: string;
  updateTime?: number;
  time?: number;
  transactTime?: number;
};

export class TabdealAdapter extends BaseExchangeAdapter {
  readonly id = "tabdeal" as const;
  readonly label = "Tabdeal";

  protected readonly capabilities = { margin: true, futures: true };

  constructor() {
    super("tabdeal");
  }

  private get apiKey(): string | undefined {
    return env.TABDEAL_API_KEY;
  }

  private get apiSecret(): string | undefined {
    return env.TABDEAL_API_SECRET;
  }

  protected get hasCredentials(): boolean {
    return Boolean(this.apiKey && this.apiSecret);
  }

  /**
   * Signed call.
   *
   * The signature is computed over the same query string that is transmitted,
   * which is why `stringifyQuery` is used for both rather than letting axios
   * re-encode the parameters separately.
   */
  private async signed<T>(options: {
    method: "GET" | "POST" | "DELETE";
    path: string;
    baseUrl?: string;
    query?: Record<string, string | number | boolean | undefined>;
    write?: boolean;
    idempotent?: boolean;
  }): Promise<T> {
    const key = this.apiKey;
    const secret = this.apiSecret;
    if (!key || !secret) {
      throw new ExchangeError(
        this.id,
        "unauthorized",
        "Tabdeal credentials are not configured",
      );
    }

    const timestamp = Date.now();
    const params: Record<string, string> = {};
    for (const [name, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) params[name] = String(value);
    }
    params.recvWindow = String(DEFAULT_RECV_WINDOW_MS);
    params.timestamp = String(timestamp);

    const payload = stringifyQuery(params);
    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const body = await request<T>({
      exchange: this.id,
      method: options.method,
      url: options.path,
      baseUrl: options.baseUrl ?? SPOT_BASE,
      headers: { "X-MBX-APIKEY": key },
      query: { ...params, signature },
      idempotent: options.idempotent ?? options.write !== true,
    });

    if (isTabdealFailure(body)) {
      raiseTabdeal(this.id, body, `${options.method} ${options.path}`);
    }
    return body;
  }

  private async public<T>(
    method: "GET",
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
    baseUrl = SPOT_BASE,
  ): Promise<T> {
    const body = await request<T>({
      exchange: this.id,
      method,
      url: path,
      baseUrl,
      query,
      idempotent: true,
    });
    if (isTabdealFailure(body)) {
      raiseTabdeal(this.id, body, `${method} ${path}`);
    }
    return body;
  }

  protected async checkCredentials(): Promise<string | null> {
    try {
      await this.signed({
        method: "GET",
        path: "/account",
        idempotent: true,
      });
      return null;
    } catch (error) {
      if (error instanceof ExchangeError) return error.message;
      throw error;
    }
  }

  override listMarkets(kind: OrderKind): Promise<MarketSpec[]> {
    // Futures are USDT-settled and use a different symbol set, so they are
    // resolved against the futures catalogue rather than the spot one.
    if (kind === "futures") {
      const fetchedAt = Date.now();
      const specs: MarketSpec[] = [];
      for (const [instrumentId, symbol] of [
        ["xaut", "XAUT_USDT"],
        ["paxg", "PAXG_USDT"],
      ] as const) {
        specs.push({
          exchange: this.id,
          symbol,
          instrumentId,
          baseAsset: instrumentId.toUpperCase(),
          quoteAsset: "usdt",
          quoteInToman: false,
          tickSize: "0.01",
          stepSize: "0.0001",
          minNotional: null,
          tradable: true,
          fetchedAt,
        });
      }
      return Promise.resolve(specs);
    }
    return super.listMarkets(kind);
  }

  override async getOrderBook(symbol: string): Promise<{
    bids: [string, string][];
    asks: [string, string][];
  } | null> {
    const payload = await this.emptyOnFailure("depth", () =>
      this.public<{
        bids?: [string, string][];
        asks?: [string, string][];
      }>("GET", "/depth", { tabdealSymbol: symbol, limit: 20 }),
    );
    if (!payload) return null;

    const levels = (raw: unknown): [string, string][] =>
      Array.isArray(raw)
        ? raw
            .filter(
              (row): row is [string, string] =>
                Array.isArray(row) && row.length >= 2,
            )
            .map((row) => [num(row[0]), num(row[1])])
        : [];

    const bids = levels(payload.bids);
    const asks = levels(payload.asks);
    return bids.length === 0 && asks.length === 0 ? null : { bids, asks };
  }

  async getBalances(): Promise<Balance[]> {
    const payload = await this.signed<{
      balances?: { asset?: string; free?: string; freeze?: string }[];
    }>({ method: "GET", path: "/account", idempotent: true });

    return (payload.balances ?? [])
      .filter((row) => typeof row.asset === "string")
      .map((row) => ({
        exchange: this.id,
        asset: normaliseTabdealAsset(row.asset ?? ""),
        // Binance spelling: `freeze`, not `locked` or `frozen`.
        free: num(row.free),
        locked: num(row.freeze),
        total: addDecimal(num(row.free), num(row.freeze)),
        valueInRial: null,
      }));
  }

  async placeLimitOrder(request_: PlaceOrderRequest): Promise<Order> {
    if (request_.kind === "futures") {
      return this.placeFuturesOrder(request_);
    }

    const spec = this.requireSpec(request_.instrumentId);

    const payload = await this.signed<TabdealOrder>({
      method: "POST",
      path: "/order",
      write: true,
      query: {
        // The underscored spelling is unambiguous; the other is the same market
        // minus the underscore.
        tabdealSymbol: spec.symbol,
        side: request_.side.toUpperCase(),
        type: "LIMIT",
        // Binance convention: quantity is always base units. `price` is quote.
        quantity: request_.amount,
        price: request_.price,
        newClientOrderId: request_.clientOrderId,
      },
    });

    return this.toOrder(payload, spec);
  }

  /**
   * Opens a leveraged perpetual position.
   *
   * Futures need a one-way/hedge decision. One-way is chosen because it is the
   * mode that lets a position be reduced by simply sending the opposite side,
   * which keeps "close" identical across venues. `side` carries the direction
   * and `positionSide` says whether the order opens or reduces.
   */
  private async placeFuturesOrder(request_: PlaceOrderRequest): Promise<Order> {
    const symbol = FUTURES_SYMBOLS[request_.instrumentId];
    if (!symbol) {
      throw ExchangeError.unsupported(
        this.id,
        `${request_.instrumentId} futures`,
      );
    }

    if (request_.leverage && request_.leverage !== "1") {
      await this.signed({
        method: "POST",
        path: "/leverage",
        baseUrl: FUTURES_BASE,
        write: true,
        query: { symbol, leverage: request_.leverage },
      });
    }

    const payload = await this.signed<TabdealOrder>({
      method: "POST",
      path: "/order",
      baseUrl: FUTURES_BASE,
      write: true,
      query: {
        symbol,
        side: request_.side.toUpperCase(),
        type: "LIMIT",
        quantity: request_.amount,
        price: request_.price,
        newClientOrderId: request_.clientOrderId,
      },
    });

    return this.toOrder(payload, {
      exchange: this.id,
      symbol,
      instrumentId: request_.instrumentId,
      baseAsset: request_.instrumentId.toUpperCase(),
      quoteAsset: "usdt",
      quoteInToman: false,
      tickSize: "0.01",
      stepSize: "0.0001",
      minNotional: null,
      tradable: true,
      fetchedAt: Date.now(),
    });
  }

  async cancelOrder(
    order: Pick<Order, "id" | "symbol" | "clientOrderId">,
  ): Promise<void> {
    await this.signed({
      method: "DELETE",
      path: "/order",
      write: true,
      query: {
        tabdealSymbol: order.symbol,
        orderId: order.id,
        origClientOrderId: order.clientOrderId ?? undefined,
      },
    });
  }

  async listOpenOrders(symbol?: string): Promise<Order[]> {
    const spec = symbol ? this.specForSymbol(symbol) : null;
    const payload = await this.signed<TabdealOrder[]>({
      method: "GET",
      path: "/openOrders",
      query: spec ? { tabdealSymbol: spec.symbol } : {},
      idempotent: true,
    });
    return (Array.isArray(payload) ? payload : []).map((raw) =>
      this.toOrder(raw, spec),
    );
  }

  async listOrderHistory(options: {
    symbol?: string;
    limit?: number;
  }): Promise<Order[]> {
    const spec = options.symbol ? this.specForSymbol(options.symbol) : null;
    const payload = await this.signed<TabdealOrder[]>({
      method: "GET",
      path: "/allOrders",
      query: {
        ...(spec ? { tabdealSymbol: spec.symbol } : {}),
        limit: Math.min(options.limit ?? 100, 1000),
      },
      idempotent: true,
    });
    return (Array.isArray(payload) ? payload : []).map((raw) =>
      this.toOrder(raw, spec),
    );
  }

  async listTrades(options: {
    symbol?: string;
    limit?: number;
  }): Promise<Trade[]> {
    const spec = options.symbol ? this.specForSymbol(options.symbol) : null;
    if (!spec) return [];

    const payload = await this.signed<Record<string, unknown>[]>({
      method: "GET",
      path: "/myTrades",
      query: {
        tabdealSymbol: spec.symbol,
        limit: Math.min(options.limit ?? 100, 1000),
      },
      idempotent: true,
    });

    return (Array.isArray(payload) ? payload : []).map((raw) => ({
      id: textOf(raw.id),
      orderId: textOf(raw.orderId),
      exchange: this.id,
      instrumentId: spec.instrumentId,
      symbol: spec.symbol,
      side: raw.isBuyer === true ? "buy" : "sell",
      price: num(raw.price),
      amount: num(raw.qty),
      value: num(raw.quoteQty),
      fee: raw.commission === undefined ? null : num(raw.commission),
      feeAsset:
        typeof raw.commissionAsset === "string" ? raw.commissionAsset : null,
      tradedAt: Number(raw.time ?? 0) || Date.now(),
    }));
  }

  async listPositions(): Promise<Position[]> {
    // `positionRisk` sits on v3 while every other futures route is v1.
    const payload = await this.signed<Record<string, unknown>[]>({
      method: "GET",
      path: "/positionRisk",
      baseUrl: FUTURES_BASE,
      idempotent: true,
    });

    return (
      (Array.isArray(payload) ? payload : [])
        // Rows with no size are slots, not positions.
        .filter((row) => parseDecimal(num(row.positionAmt)).mantissa !== 0n)
        .map((row) => {
          const amount = num(row.positionAmt);
          const instrumentId = instrumentForFuturesSymbol(textOf(row.symbol));
          return {
            id: `${textOf(row.symbol)}:${amount}`,
            exchange: this.id,
            kind: "futures",
            instrumentId,
            symbol: textOf(row.symbol),
            // A negative position amount is a short.
            side: parseDecimal(amount).mantissa < 0n ? "short" : "long",
            status: "open",
            leverage: row.leverage === undefined ? null : num(row.leverage),
            size: toPlainString(
              parseDecimal(amount).mantissa < 0n
                ? {
                    mantissa: -parseDecimal(amount).mantissa,
                    scale: parseDecimal(amount).scale,
                  }
                : parseDecimal(amount),
            ),
            entryPrice: num(row.entryPrice),
            liquidationPrice:
              row.liquidationPrice === undefined
                ? null
                : num(row.liquidationPrice),
            unrealizedPnl:
              row.unRealizedProfit === undefined
                ? null
                : num(row.unRealizedProfit),
            unrealizedPnlPercent: null,
            realizedPnl: null,
            margin:
              row.initialMargin === undefined ? null : num(row.initialMargin),
            openedAt: null,
            closedAt: null,
          } satisfies Position;
        })
    );
  }

  async closePosition(
    position: Pick<Position, "id" | "symbol">,
    options?: { price?: string; amount?: string },
  ): Promise<Order> {
    if (!options?.price) {
      throw new ExchangeError(
        this.id,
        "invalid_request",
        "closing a Tabdeal position requires an explicit limit price",
      );
    }

    // One-way mode: closing a long is a sell and vice versa. The app keeps the
    // signed size on the id so the opposite side can be derived.
    const isShort = position.id.includes("-") && !position.id.endsWith("-0");

    const payload = await this.signed<TabdealOrder>({
      method: "POST",
      path: "/order",
      baseUrl: FUTURES_BASE,
      write: true,
      query: {
        symbol: position.symbol,
        side: isShort ? "BUY" : "SELL",
        type: "LIMIT",
        quantity: options.amount ?? "0",
        price: options.price,
        reduceOnly: "true",
      },
    });

    return this.toOrder(payload, null);
  }

  /**
   * Sets take-profit and stop-loss natively on a perpetual position.
   *
   * Tabdeal exposes a real `positionSlTp` endpoint on FAPI, so the levels live on
   * the exchange: they are enforced by its matching engine, they survive this app
   * being closed, and they do not consume an order slot when they fire.
   *
   * Two details that are easy to get wrong:
   *
   * - **`positionSide` is omitted.** The adapter keeps positions in one-way mode,
   *   where a position is reduced by simply sending the opposite side, so there is
   *   no long/short slot to name. Sending it anyway is rejected.
   * - **A level is cleared by omitting its price type, not by sending null.**
   *   Removing a stop and adding one are the same call, distinguished by which
   *   fields are present.
   */
  async setPositionProtection(
    position: Pick<Position, "id" | "symbol">,
    protection: { takeProfit?: string | null; stopLoss?: string | null },
  ): Promise<ProtectionResult> {
    // Narrowed once here rather than asserted at each use, so the guard that
    // decides whether a level is being set is the same one that supplies it.
    const takeProfit =
      typeof protection.takeProfit === "string" ? protection.takeProfit : null;
    const stopLoss =
      typeof protection.stopLoss === "string" ? protection.stopLoss : null;

    if (takeProfit === null && stopLoss === null) {
      return {
        mode: "native",
        takeProfit: null,
        stopLoss: null,
        note: null,
      };
    }

    // Built as a plain string map because the optional fields are `string | null`
    // and the query type does not accept null; a level is simply absent when it is
    // not being set, which is how this endpoint clears one.
    const query: Record<string, string> = { symbol: position.symbol };
    // Mark triggers rather than last-price triggers, so a wick through the level
    // does not fire the stop on its own.
    if (takeProfit !== null) {
      query.takeProfitPrice = takeProfit;
      query.takeProfitType = "MARK_PRICE";
    }
    if (stopLoss !== null) {
      query.stopLossPrice = stopLoss;
      query.stopLossType = "MARK_PRICE";
    }

    await this.signed({
      method: "POST",
      path: "/positionSlTp",
      baseUrl: FUTURES_BASE,
      write: true,
      query,
    });

    return {
      mode: "native",
      takeProfit,
      stopLoss,
      note: null,
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

  private toOrder(raw: TabdealOrder, spec: MarketSpec | null): Order {
    const executed = num(raw.executedQty);
    const total = num(raw.origQty);
    return {
      id: textOf(raw.orderId),
      clientOrderId: raw.clientOrderId ?? null,
      exchange: this.id,
      kind: "spot",
      instrumentId: spec?.instrumentId ?? "unknown",
      symbol: raw.tabdealSymbol ?? raw.symbol ?? spec?.symbol ?? "",
      side: (raw.side ?? "").toUpperCase() === "SELL" ? "sell" : "buy",
      status: orderStatusOf(raw.status),
      price: num(raw.price),
      amount: total,
      filledAmount: executed,
      averagePrice:
        executed === "0"
          ? null
          : num(raw.cummulativeQuoteQty ?? raw.cumulativeQuoteQty),
      filledValue: num(raw.cummulativeQuoteQty ?? raw.cumulativeQuoteQty),
      fee: null,
      feeAsset: null,
      createdAt: Number(raw.transactTime ?? raw.time ?? 0) || Date.now(),
      updatedAt:
        Number(raw.updateTime ?? raw.transactTime ?? raw.time ?? 0) ||
        Date.now(),
      note: null,
    };
  }
}

const FUTURES_SYMBOLS: Record<string, string> = {
  xaut: "XAUT_USDT",
  paxg: "PAXG_USDT",
};

function instrumentForFuturesSymbol(symbol: string): string {
  const base = symbol.split("_")[0] ?? "";
  if (base === "XAUT") return "xaut";
  if (base === "PAXG") return "paxg";
  if (base === "USDT") return "usdt";
  return "unknown";
}

/** Tabdeal's `_IRT` is Toman, so it is canonicalised to RLS like the others. */
function normaliseTabdealAsset(asset: string): string {
  const key = asset.trim().toUpperCase();
  if (key === "IRT" || key === "TMN" || key === "TOMAN" || key === "RIAL") {
    return "RLS";
  }
  return key;
}

/**
 * Deterministic query serialisation.
 *
 * The signature is taken over exactly this string, so the same function must
 * produce the transmitted query. `URLSearchParams` is not used because its
 * encoding of characters like `.` and `~` differs from what is signed.
 */
function stringifyQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
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
