import "server-only";

import {
  VENUE_MARKETS,
  type VenueMarket,
} from "~/constants/tradingInstruments";
import { INSTRUMENTS } from "~/constants/tradingInstruments";
import {
  MIN_SPACING_MS,
  Pacer,
} from "~/services/exchanges/http";
import {
  ExchangeError,
  type ExchangeAdapter,
  type ProtectionResult,
} from "~/services/trading/exchange.port";
import type {
  Balance,
  ExchangeId,
  ExchangeSession,
  MarketSpec,
  Order,
  OrderKind,
  Position,
  Trade,
} from "~/services/trading/trading.types";

/**
 * Shared scaffolding for every venue adapter.
 *
 * What lives here is only what genuinely is the same everywhere: pacing, the
 * credential gate, and turning the {@link VENUE_MARKETS} catalogue into
 * `MarketSpec` rows. Everything that differs — authentication, payload shape,
 * how a partial fill is spelled, whether a business failure arrives with a 200
 * — is left abstract, because those differences are the reason adapters exist.
 *
 * Subclasses must not assume their own defaults: `listPositions` and
 * `closePosition` throw `unsupported` here so that a venue without leverage
 * fails loudly instead of silently reporting no positions when there are some.
 */
export abstract class BaseExchangeAdapter implements ExchangeAdapter {
  abstract readonly id: ExchangeId;
  abstract readonly label: string;

  /** Levers this venue exposes, used to build the boot-time session report. */
  protected abstract readonly capabilities: {
    margin: boolean;
    futures: boolean;
  };

  protected readonly read: Pacer;
  protected readonly write: Pacer;

  constructor(id: ExchangeId) {
    const spacing = MIN_SPACING_MS[id];
    this.read = new Pacer(spacing.read);
    this.write = new Pacer(spacing.write);
  }

  /** False when no credential is configured, which hides the venue's buttons. */
  protected abstract get hasCredentials(): boolean;

  /** Cheap authenticated call used by `probe`. Subclasses override. */
  protected abstract checkCredentials(): Promise<string | null>;

  async probe(): Promise<ExchangeSession> {
    const capabilities = this.capabilities;
    const kind = capabilities.futures
      ? "spot+futures"
      : capabilities.margin
        ? "spot+margin"
        : "spot";

    if (!this.hasCredentials) {
      return {
        exchange: this.id,
        label: this.label,
        ready: false,
        kind,
        supportsMargin: capabilities.margin,
        supportsFutures: capabilities.futures,
        note: `no credentials configured for ${this.label}`,
      };
    }

    try {
      const problem = await this.checkCredentials();
      return {
        exchange: this.id,
        label: this.label,
        ready: problem === null,
        kind,
        supportsMargin: capabilities.margin,
        supportsFutures: capabilities.futures,
        note: problem,
      };
    } catch (error) {
      return {
        exchange: this.id,
        label: this.label,
        ready: false,
        kind,
        supportsMargin: capabilities.margin,
        supportsFutures: capabilities.futures,
        note: error instanceof Error ? error.message : "probe failed",
      };
    }
  }

  /**
   * Markets assembled from the local catalogue, cross-checked against whatever
   * the venue reports.
   *
   * The catalogue is authoritative for increments because it was read off these
   * endpoints, and it is available before the first authenticated call. Where a
   * live list is available the subclass overrides this; where it is not, the
   * catalogue is the whole answer.
   */
  listMarkets(kind: OrderKind): Promise<MarketSpec[]> {
    const catalogue = VENUE_MARKETS[this.id] ?? {};
    const fetchedAt = Date.now();
    const specs: MarketSpec[] = [];

    for (const row of INSTRUMENTS) {
      const market = catalogue[row.id];
      if (!market) continue;

      if (kind !== "spot" && market.symbol === "") {
        // No leveraged market here either; the caller asks per instrument.
      }

      const spec = this.toMarketSpec(row.id, market, fetchedAt);
      if (spec) specs.push(spec);
    }

    return Promise.resolve(specs);
  }

  protected toMarketSpec(
    instrumentId: string,
    market: VenueMarket,
    fetchedAt: number,
  ): MarketSpec | null {
    if (market.symbol === "" || market.unavailable) return null;
    const row = INSTRUMENTS.find((entry) => entry.id === instrumentId);
    if (!row) return null;

    return {
      exchange: this.id,
      symbol: market.symbol,
      instrumentId,
      baseAsset: row.baseAsset,
      quoteAsset: row.quoteAsset,
      quoteInToman: market.quoteInToman,
      tickSize: market.tickSize,
      stepSize: market.stepSize,
      minNotional: market.minNotional,
      tradable: true,
      fetchedAt,
    };
  }

  /** Looks up the trading rules for one instrument on this venue. */
  marketSpec(instrumentId: string): MarketSpec | null {
    const market = VENUE_MARKETS[this.id]?.[instrumentId];
    if (!market) return null;
    return this.toMarketSpec(instrumentId, market, Date.now());
  }

  /** Venues that publish a book implement this; the rest report none. */
  async getOrderBook(
    _symbol: string,
  ): Promise<{ bids: [string, string][]; asks: [string, string][] } | null> {
    return null;
  }

  abstract getBalances(): Promise<Balance[]>;
  abstract placeLimitOrder(
    request: Parameters<ExchangeAdapter["placeLimitOrder"]>[0],
  ): Promise<Order>;
  abstract cancelOrder(
    order: Pick<Order, "id" | "symbol" | "clientOrderId">,
  ): Promise<void>;
  abstract listOpenOrders(symbol?: string): Promise<Order[]>;
  abstract listOrderHistory(options: {
    symbol?: string;
    limit?: number;
  }): Promise<Order[]>;
  abstract listTrades(options: {
    symbol?: string;
    limit?: number;
  }): Promise<Trade[]>;

  /** Read methods degrade to an empty list rather than blanking the screen. */
  protected emptyOnFailure<T>(what: string, run: () => Promise<T>): Promise<T> {
    return run().catch((error: unknown) => {
      if (error instanceof ExchangeError) return [] as T;
      throw error;
    });
  }

  async listPositions(): Promise<Position[]> {
    return [];
  }

  async closePosition(
    _position: Pick<Position, "id" | "symbol">,
    _options?: { price?: string; amount?: string },
  ): Promise<Order> {
    throw ExchangeError.unsupported(this.id, "leveraged positions");
  }

  /**
   * Venues without leverage report `unsupported` rather than pretending.
   *
   * A subclass that *can* protect a position overrides this. Whether it overrides
   * it with an exchange-side order or with an app-side watcher is reported in the
   * result, because the two carry very different guarantees.
   */
  async setPositionProtection(
    _position: Pick<Position, "id" | "symbol">,
    _protection: { takeProfit?: string | null; stopLoss?: string | null },
  ): Promise<ProtectionResult> {
    return {
      mode: "unsupported",
      takeProfit: null,
      stopLoss: null,
      note: `${this.label} has no leveraged positions to protect`,
    };
  }
}
