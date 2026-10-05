import "server-only";

import { env } from "~/env.js";
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

/**
 * Wallex.
 *
 * Three quirks drive this adapter.
 *
 * **There is no `IRT` market here at all.** Every Wallex market is quoted in
 * `TMN` or `USDT`, and `TMN` is Toman. So `USDTTMN` is the whole stablecoin
 * surface and the board's Rial price has to be divided by ten on the way here.
 * An earlier version of this repo also listed `USDTIRT` and `XAUTIRT` as Wallex
 * candidates; those symbols do not exist and could only ever produce an empty
 * tile.
 *
 * **`stepSize` is a decimal count, not an increment.** XAUT comes back as
 * `"5"` and the live book really does show five decimal places, while
 * `tickSize: "0"` on a Toman market means one whole Toman. The catalogue has
 * already converted these, so nothing here has to know.
 *
 * **`client_id` only accepts `[A-Z_0-9]`.** The lower-case or hyphenated id
 * every other venue accepts is rejected here, so the app's own uuid is folded
 * into an allowed alphabet before it is sent.
 */

const BASE = "https://api.wallex.ir";

type WallexEnvelope<T> = {
  success?: boolean;
  message?: string;
  result?: T;
  code?: number | string;
};

/**
 * Reads a Wallex envelope.
 *
 * Wallex signals failure with `success: false` and a numeric `code` rather than
 * an HTTP status, and on a validation failure `result` becomes a field-to-
 * message map instead of the payload.
 */
function unwrapWallex<T>(
  exchange: "wallex",
  payload: unknown,
  what: string,
): T {
  if (typeof payload !== "object" || payload === null) {
    throw new ExchangeError(
      exchange,
      "unavailable",
      `${what}: unexpected response`,
    );
  }
  const envelope = payload as WallexEnvelope<T>;
  if (
    envelope.success === false ||
    (envelope.code !== undefined && envelope.result === undefined)
  ) {
    let detail = envelope.message ?? `code ${String(envelope.code)}`;
    if (typeof envelope.result === "object" && envelope.result !== null) {
      const first = Object.values(
        envelope.result as Record<string, unknown>,
      )[0];
      if (typeof first === "string") detail = first;
    }
    const code = envelope.code === undefined ? null : String(envelope.code);
    const kind =
      code === "1201" || code === "1204"
        ? "unauthorized"
        : code === "422"
          ? "invalid_request"
          : "rejected";
    throw new ExchangeError(exchange, kind, `${what}: ${detail}`, code);
  }
  if (envelope.result === undefined) {
    throw new ExchangeError(exchange, "unavailable", `${what}: empty result`);
  }
  return envelope.result;
}

function num(value: unknown): string {
  if (value === null || value === undefined) return "0";
  return toPlainString(parseDecimal(value as string | number));
}

/**
 * Folds an app client id into Wallex's `[A-Z_0-9]` alphabet.
 *
 * The id is our idempotency handle, so it cannot simply be regenerated per
 * venue: a retry must produce the same string. Upper-casing and replacing
 * disallowed characters is stable, which is the property that matters.
 */
export function wallexClientId(raw: string): string {
  const cleaned = raw
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 32);
  return cleaned.length > 0
    ? cleaned
    : `O${Date.now().toString(36).toUpperCase()}`;
}

type WallexOrder = {
  clientOrderId?: string;
  side?: string;
  symbol?: string;
  type?: string;
  status?: string;
  price?: string;
  origQty?: string;
  executedQty?: string;
  executedPrice?: string;
  executedSum?: string;
  fee?: string;
  created_at?: string;
  updated_at?: string;
};

/**
 * Wallex documents no closed status enum, only `NEW`, `FILLED` and `CANCELED`
 * in examples and a reference to `FINISHED` elsewhere. Anything not recognised
 * and not holding a residual size is treated as terminal rather than open, so a
 * venue-side rename cannot leave a phantom resting order forever.
 */
function orderStatusOf(
  raw: string | undefined,
  filled: string,
  total: string,
): OrderStatus {
  const f = parseDecimal(filled);
  const t = parseDecimal(total);
  const isFull = t.mantissa > 0n && f.mantissa >= t.mantissa;
  const isPartial = f.mantissa > 0n && !isFull;

  switch ((raw ?? "").toUpperCase()) {
    case "NEW":
    case "PENDING":
      return isPartial ? "partially_filled" : "open";
    case "FILLED":
      return "filled";
    case "CANCELED":
    case "CANCELLED":
    case "EXPIRED":
      return "canceled";
    case "REJECTED":
      return "rejected";
    default:
      if (isFull) return "filled";
      if (isPartial) return "partially_filled";
      return "open";
  }
}

export class WallexAdapter extends BaseExchangeAdapter {
  readonly id = "wallex" as const;
  readonly label = "Wallex";

  // Margin exists on Wallex but its market list excludes every gold pair, so
  // leveraged XAUT or PAXG is not something this adapter can offer.
  protected readonly capabilities = { margin: true, futures: false };

  constructor() {
    super("wallex");
  }

  private get apiKey(): string | undefined {
    return env.WALLEX_API_KEY;
  }

  protected get hasCredentials(): boolean {
    return typeof this.apiKey === "string" && this.apiKey.length > 0;
  }

  private auth(): Record<string, string> {
    if (!this.apiKey) {
      throw new ExchangeError(
        this.id,
        "unauthorized",
        "WALLEX_API_KEY is not configured",
      );
    }
    // Note the header name. Wallex also reads an `authorization` header, but
    // that is the web UI's session token and is not a supported API mechanism.
    return { "x-api-key": this.apiKey };
  }

  private call<T>(options: {
    method: "GET" | "POST" | "DELETE";
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    write?: boolean;
    idempotent?: boolean;
  }): Promise<T> {
    return this.write.schedule(() =>
      this.read.schedule(() =>
        request<T>({
          exchange: this.id,
          method: options.method,
          url: options.path,
          baseUrl: BASE,
          headers: this.auth(),
          query: options.query,
          body: options.body,
          idempotent: options.idempotent ?? options.write !== true,
        }),
      ),
    );
  }

  private async publicCall<T>(
    method: "GET",
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.read.schedule(() =>
      request<T>({
        exchange: this.id,
        method,
        url: path,
        baseUrl: BASE,
        query,
        idempotent: true,
      }),
    );
  }

  protected async checkCredentials(): Promise<string | null> {
    try {
      await this.call({
        method: "GET",
        path: "/v1/account/balances",
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
    const payload = await this.emptyOnFailure("depth", () =>
      this.publicCall<WallexEnvelope<Record<string, unknown>>>(
        "GET",
        "/v1/depth",
        { symbol },
      ),
    );
    if (!payload) return null;

    const result = payload.result ?? {};
    // Wallex uses the singular `bid`/`ask`, unlike every other venue here.
    const levels = (key: string): [string, string][] => {
      const raw = result[key];
      if (!Array.isArray(raw)) return [];
      const out: [string, string][] = [];
      for (const level of raw) {
        if (level && typeof level === "object") {
          const bag = level as Record<string, unknown>;
          out.push([num(bag.price), num(bag.quantity ?? bag.amount)]);
        } else if (Array.isArray(level) && level.length >= 2) {
          out.push([num(level[0]), num(level[1])]);
        }
      }
      return out;
    };

    const bids = levels("bid");
    const asks = levels("ask");
    return bids.length === 0 && asks.length === 0 ? null : { bids, asks };
  }

  async getBalances(): Promise<Balance[]> {
    const payload = await this.call<unknown>({
      method: "GET",
      path: "/v1/account/balances",
      idempotent: true,
    });

    const result = unwrapWallex<
      { asset?: string; value?: string; locked?: string }[]
    >(this.id, payload, "balances");

    return result
      .filter((row) => typeof row.asset === "string")
      .map((row) => ({
        exchange: this.id,
        asset: (row.asset ?? "").toUpperCase(),
        // Wallex publishes a total and a reserved amount rather than a free
        // balance, so spendable is the difference.
        free: subtractDecimal(num(row.value), num(row.locked)),
        locked: num(row.locked),
        total: num(row.value),
        valueInRial: null,
      }));
  }

  async placeLimitOrder(request_: PlaceOrderRequest): Promise<Order> {
    const spec = this.requireSpec(request_.instrumentId);

    const payload = await this.call<unknown>({
      method: "POST",
      path: "/v1/account/orders",
      write: true,
      body: {
        side: request_.side === "buy" ? "BUY" : "SELL",
        symbol: spec.symbol,
        type: "LIMIT",
        price: request_.price,
        quantity: request_.amount,
        client_id: wallexClientId(request_.clientOrderId),
      },
    });

    const result = unwrapWallex<WallexOrder>(this.id, payload, "place order");
    return this.toOrder(result, spec);
  }

  /**
   * Cancels by client id rather than venue id.
   *
   * Wallex exposes no numeric order id on its order resource; `clientOrderId` is
   * the only handle, which is why the app always supplies one.
   */
  async cancelOrder(
    order: Pick<Order, "id" | "symbol" | "clientOrderId">,
  ): Promise<void> {
    const handle = order.clientOrderId;
    if (!handle) {
      throw new ExchangeError(
        this.id,
        "invalid_request",
        "cancelling a Wallex order requires its client order id",
      );
    }

    await this.call({
      method: "DELETE",
      path: `/v1/account/orders/${encodeURIComponent(handle)}`,
      write: true,
    });
  }

  async listOpenOrders(symbol?: string): Promise<Order[]> {
    const spec = symbol ? this.specForSymbol(symbol) : null;

    const payload = await this.call<unknown>({
      method: "GET",
      path: "/v1/account/openOrders",
      query: {
        ...(spec ? { symbol: spec.symbol } : {}),
        page: 1,
        per_page: 100,
      },
      idempotent: true,
    });

    const result = unwrapWallex<WallexOrder[]>(this.id, payload, "open orders");
    return result.map((raw) => this.toOrder(raw, spec));
  }

  async listOrderHistory(options: {
    symbol?: string;
    limit?: number;
  }): Promise<Order[]> {
    const spec = options.symbol ? this.specForSymbol(options.symbol) : null;

    const payload = await this.call<unknown>({
      method: "GET",
      path: "/v1/account/orders",
      query: {
        ...(spec ? { market: spec.symbol } : {}),
        page: 1,
        per_page: Math.min(options.limit ?? 100, 100),
      },
      idempotent: true,
    });

    const result = unwrapWallex<{ orders?: WallexOrder[] } | WallexOrder[]>(
      this.id,
      payload,
      "order history",
    );

    const rows = Array.isArray(result) ? result : (result.orders ?? []);
    return rows.map((raw) => this.toOrder(raw, spec));
  }

  async listTrades(options: {
    symbol?: string;
    limit?: number;
  }): Promise<Trade[]> {
    const spec = options.symbol ? this.specForSymbol(options.symbol) : null;
    if (!spec) return [];

    const payload = await this.call<unknown>({
      method: "GET",
      path: "/v1/account/orders",
      query: {
        market: spec.symbol,
        page: 1,
        per_page: Math.min(options.limit ?? 100, 100),
      },
      idempotent: true,
    });

    const result = unwrapWallex<{ orders?: WallexOrder[] } | WallexOrder[]>(
      this.id,
      payload,
      "trades",
    );

    const rows = Array.isArray(result) ? result : (result.orders ?? []);
    return rows.map((raw) => ({
      id: raw.clientOrderId ?? "",
      orderId: raw.clientOrderId ?? "",
      exchange: this.id,
      instrumentId: spec.instrumentId,
      symbol: spec.symbol,
      side: (raw.side ?? "").toUpperCase() === "SELL" ? "sell" : "buy",
      price: num(raw.executedPrice ?? raw.price),
      amount: num(raw.executedQty),
      value: num(raw.executedSum),
      fee: raw.fee === undefined ? null : num(raw.fee),
      feeAsset: null,
      tradedAt:
        Date.parse(String(raw.updated_at ?? raw.created_at ?? "")) ||
        Date.now(),
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

  private toOrder(raw: WallexOrder, spec: MarketSpec | null): Order {
    const amount = num(raw.origQty);
    const filled = num(raw.executedQty);
    const status = orderStatusOf(raw.status, filled, amount);
    return {
      id: raw.clientOrderId ?? "",
      clientOrderId: raw.clientOrderId ?? null,
      exchange: this.id,
      kind: "spot",
      instrumentId: spec?.instrumentId ?? "unknown",
      symbol: textOf(raw.symbol) || (spec?.symbol ?? ""),
      side: (raw.side ?? "").toUpperCase() === "SELL" ? "sell" : "buy",
      status,
      price: num(raw.price),
      amount,
      filledAmount: filled,
      averagePrice: filled === "0" ? null : num(raw.executedPrice),
      filledValue: raw.executedSum === undefined ? null : num(raw.executedSum),
      fee: raw.fee === undefined ? null : num(raw.fee),
      feeAsset: null,
      createdAt: epochOf(raw.created_at) ?? Date.now(),
      updatedAt:
        Date.parse(String(raw.updated_at ?? raw.created_at ?? "")) ||
        Date.now(),
      note: null,
    };
  }
}

function subtractDecimal(a: string, b: string): string {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  const scale = Math.max(left.scale, right.scale);
  const total =
    left.mantissa * 10n ** BigInt(scale - left.scale) -
    right.mantissa * 10n ** BigInt(scale - right.scale);
  return toPlainString({ mantissa: total < 0n ? 0n : total, scale });
}
