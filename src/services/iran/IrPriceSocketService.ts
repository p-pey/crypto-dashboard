import { IR_ASSETS, IR_EXCHANGES } from "~/constants/iranExchanges";
import { AppSignleton } from "~/lib/container";
import { CentrifugoClient } from "./CentrifugoClient";
import { IrPriceMapper } from "./iran.mapper";
import type {
  IrResolvedSymbols,
  IrTicker,
  IrTickerListener,
  IrTickerStatus,
} from "./iran.types";

type SocketLike = { close: () => void };

type ChannelBinding = {
  stream: string;
  assetId: IrTicker["asset"];
  quoteScale: number;
};

const FLUSH_INTERVAL_MS = 250;
const SPARK_LIMIT = 60;

/**
 * Appends a price to a rolling window, returning the same array reference when
 * nothing changed so memoised sparkline cells can skip a re-render.
 */
function extendSpark(window: number[], price: number | null): number[] {
  if (price === null || !Number.isFinite(price) || price <= 0) return window;
  if (window[window.length - 1] === price) return window;

  const next = [...window, price];
  return next.length > SPARK_LIMIT ? next.slice(-SPARK_LIMIT) : next;
}
const STALE_AFTER_MS = 60_000;

/**
 * Client side fan-in for every Iranian exchange.
 *
 * A REST snapshot is fetched first (see `iran.router.ts`) so the exact symbol
 * variant of each market is known, then this service keeps every price fresh:
 * native WebSocket for Tabdeal, a hand rolled Centrifugo frame handler for
 * Nobitex and Bitpin, and socket.io-client for Wallex.
 */
@AppSignleton()
export default class IrPriceSocketService {
  private tickers = new Map<string, IrTicker>();
  private listeners: IrTickerListener[] = [];
  private centrifugo = new Map<string, CentrifugoClient>();
  private rawSockets = new Map<string, WebSocket>();
  private ioSockets = new Map<string, SocketLike>();
  private bindings = new Map<string, ChannelBinding>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  getTickers(): IrTicker[] {
    return [...this.tickers.values()];
  }

  subscribe(listener: IrTickerListener): () => void {
    this.listeners.push(listener);
    listener(this.getTickers());
    return () => {
      this.listeners = this.listeners.filter((item) => item !== listener);
    };
  }

  /**
   * `snapshot` seeds the state with the REST prices so the table is never
   * empty while the sockets hand over.
   */
  start(snapshot: IrTicker[], resolved: IrResolvedSymbols) {
    this.stop();
    this.running = true;
    this.tickers.clear();

    for (const ticker of snapshot) {
      this.tickers.set(ticker.key, {
        ...ticker,
        spark: extendSpark([], ticker.mid),
      });
    }

    for (const exchange of IR_EXCHANGES) {
      const exchangeBindings = this.buildBindings(exchange.id, resolved);
      if (exchangeBindings.length === 0) continue;

      for (const binding of exchangeBindings) {
        this.bindings.set(`${exchange.id}|${binding.stream}`, binding);
      }

      switch (exchange.socket.protocol) {
        case "centrifugo":
          this.connectCentrifugo(exchange.id, exchangeBindings);
          break;
        case "jsonrpc":
          this.connectJsonRpc(exchange.id, exchangeBindings);
          break;
        case "socketio":
          this.connectSocketIo(exchange.id, exchangeBindings);
          break;
      }
    }

    this.staleTimer = setInterval(() => this.markStale(), STALE_AFTER_MS);
    this.scheduleFlush();
  }

  stop() {
    this.running = false;

    this.centrifugo.forEach((client) => client.close());
    this.centrifugo.clear();

    this.rawSockets.forEach((socket) => {
      socket.onclose = null;
      socket.close();
    });
    this.rawSockets.clear();

    this.ioSockets.forEach((socket) => socket.close());
    this.ioSockets.clear();

    this.bindings.clear();

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.staleTimer) {
      clearInterval(this.staleTimer);
      this.staleTimer = null;
    }
  }

  /**
   * Folds a fresh REST snapshot into the live state.
   *
   * Rows already streaming from a socket are left untouched, so this doubles as
   * the fallback for exchanges whose socket never comes up (Wallex's socket.io
   * gateway answers 503 on some networks) - those rows just keep refreshing
   * from REST every poll instead.
   */
  mergeSnapshot(snapshot: IrTicker[]) {
    for (const incoming of snapshot) {
      const current = this.tickers.get(incoming.key);
      if (current?.status === "live" && current.mid !== null) continue;
      this.tickers.set(incoming.key, {
        ...incoming,
        spark: extendSpark(current?.spark ?? [], incoming.mid),
      });
    }
    this.scheduleFlush();
  }

  private buildBindings(exchangeId: string, resolved: IrResolvedSymbols) {
    const exchange = IR_EXCHANGES.find((item) => item.id === exchangeId);
    if (!exchange) return [];

    const exchangeResolved = resolved[exchange.id] ?? {};
    const bindings: ChannelBinding[] = [];

    for (const asset of IR_ASSETS) {
      const spec = exchangeResolved[asset.id];
      if (!spec) continue;
      bindings.push({
        stream: exchange.socket.stream(spec.streamSymbol ?? spec.symbol),
        assetId: asset.id,
        quoteScale: spec.quoteScale,
      });
    }

    return bindings;
  }

  private connectCentrifugo(exchangeId: string, bindings: ChannelBinding[]) {
    const exchange = IR_EXCHANGES.find((item) => item.id === exchangeId);
    if (!exchange) return;

    const client = new CentrifugoClient({
      url: exchange.socket.url,
      channels: bindings.map((binding) => binding.stream),
      onStatus: (status) =>
        this.setExchangeStatus(
          exchangeId,
          status === "open"
            ? "live"
            : status === "connecting"
              ? "connecting"
              : "stale",
        ),
      onData: (channel, data) => this.applyUpdate(exchangeId, channel, data),
    });

    this.centrifugo.set(exchangeId, client);
    client.connect();
  }

  private connectJsonRpc(exchangeId: string, bindings: ChannelBinding[]) {
    const exchange = IR_EXCHANGES.find((item) => item.id === exchangeId);
    if (!exchange) return;

    this.setExchangeStatus(exchangeId, "connecting");

    let socket: WebSocket;
    try {
      socket = new WebSocket(exchange.socket.url);
    } catch {
      this.setExchangeStatus(exchangeId, "error");
      return;
    }

    socket.onopen = () => {
      this.setExchangeStatus(exchangeId, "live");
      socket.send(
        JSON.stringify({
          method: "SUBSCRIBE",
          id: 1,
          params: bindings.map((binding) => binding.stream),
        }),
      );
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      const binding = this.matchBinding(exchangeId, event.data);
      if (!binding) return;
      const payload = this.unwrapPayload(event.data);
      this.applyUpdate(exchangeId, binding.stream, payload);
    };

    socket.onerror = () => this.setExchangeStatus(exchangeId, "error");
    socket.onclose = () => {
      this.rawSockets.delete(exchangeId);
      if (!this.running) return;
      this.setExchangeStatus(exchangeId, "stale");
      setTimeout(() => this.connectJsonRpc(exchangeId, bindings), 5_000);
    };

    this.rawSockets.set(exchangeId, socket);
  }

  private connectSocketIo(exchangeId: string, bindings: ChannelBinding[]) {
    const exchange = IR_EXCHANGES.find((item) => item.id === exchangeId);
    if (!exchange) return;

    this.setExchangeStatus(exchangeId, "connecting");

    void import("socket.io-client").then(({ io }) => {
      if (!this.running) return;

      const socket = io(exchange.socket.url, {
        transports: ["websocket"],
        reconnectionDelay: 5_000,
        reconnectionDelayMax: 15_000,
      });

      socket.on("connect", () => {
        this.setExchangeStatus(exchangeId, "live");
        for (const binding of bindings) {
          socket.emit("subscribe", { channel: binding.stream });
        }
      });

      socket.on("Broadcaster", (message: unknown) => {
        const binding = this.matchBinding(exchangeId, message);
        if (!binding) return;
        this.applyUpdate(
          exchangeId,
          binding.stream,
          this.unwrapPayload(message),
        );
      });

      socket.on("connect_error", () =>
        this.setExchangeStatus(exchangeId, "error"),
      );
      socket.on("disconnect", () => {
        if (this.running) this.setExchangeStatus(exchangeId, "stale");
      });

      this.ioSockets.set(exchangeId, socket);
    });
  }

  /**
   * None of the five exchanges label every depth message with its market, so
   * fall back to finding which configured symbol the raw frame mentions.
   */
  private matchBinding(
    exchangeId: string,
    message: unknown,
  ): ChannelBinding | null {
    const raw = typeof message === "string" ? message : JSON.stringify(message);
    if (!raw) return null;

    const exchange = IR_EXCHANGES.find((item) => item.id === exchangeId);
    if (!exchange) return null;

    let best: ChannelBinding | null = null;
    for (const [key, binding] of this.bindings) {
      if (!key.startsWith(`${exchangeId}|`)) continue;
      if (
        raw.includes(binding.stream) ||
        raw.includes(binding.stream.split("@")[0] ?? "")
      ) {
        if (!best || binding.stream.length > best.stream.length) best = binding;
      }
    }

    return best;
  }

  /** Depth frames are wrapped in `pub`, `data` or `result` depending on the exchange. */
  private unwrapPayload(message: unknown): unknown {
    if (typeof message === "string") {
      try {
        return this.unwrapPayload(JSON.parse(message) as unknown);
      } catch {
        return null;
      }
    }
    if (typeof message !== "object" || message === null) return null;

    const record = message as Record<string, unknown>;
    for (const key of ["pub", "data", "result", "payload"]) {
      const value = record[key];
      if (typeof value === "object" && value !== null) return value;
    }
    return record;
  }

  private applyUpdate(exchangeId: string, channel: string, data: unknown) {
    const binding = this.bindings.get(`${exchangeId}|${channel}`);
    if (!binding) return;

    const exchange = IR_EXCHANGES.find((item) => item.id === exchangeId);
    const asset = IR_ASSETS.find((item) => item.id === binding.assetId);
    if (!exchange || !asset) return;

    const key = `${exchangeId}:${binding.assetId}`;
    const previous = this.tickers.get(key);

    const next = IrPriceMapper.buildTicker({
      ...IrPriceMapper.identity(exchange, asset),
      symbol: previous?.symbol ?? null,
      raw: data,
      quoteScale: binding.quoteScale,
      status: "live",
      source: "socket",
      updatedAt: Date.now(),
      spark: previous?.spark ?? [],
    });

    if (next.bestBid === null && next.bestAsk === null && next.last === null) {
      return;
    }

    next.spark = extendSpark(next.spark, next.mid);

    this.tickers.set(key, next);
    this.scheduleFlush();
  }

  private setExchangeStatus(exchangeId: string, status: IrTickerStatus) {
    let changed = false;

    for (const [key, ticker] of this.tickers) {
      if (!key.startsWith(`${exchangeId}:`)) continue;
      if (ticker.status === "error") continue;
      if (ticker.status === status) continue;
      this.tickers.set(key, { ...ticker, status });
      changed = true;
    }

    if (changed) this.scheduleFlush();
  }

  private markStale() {
    const now = Date.now();
    let changed = false;

    for (const [key, ticker] of this.tickers) {
      if (ticker.status !== "live") continue;
      if (
        ticker.updatedAt === null ||
        now - ticker.updatedAt < STALE_AFTER_MS
      ) {
        continue;
      }
      this.tickers.set(key, { ...ticker, status: "stale" });
      changed = true;
    }

    if (changed) this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimer || !this.running) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  private flush() {
    const tickers = this.getTickers();
    for (const listener of this.listeners) listener(tickers);
  }
}
