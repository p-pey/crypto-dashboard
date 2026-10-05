import { AppSignleton } from "~/lib/container";
import { CoinStore } from "~/services/coins/CoinStore";
import type { BinanceTicker } from "~/services/binance/binance.types";

/**
 * The Binance connection behind the coin table.
 *
 * Replaces the previous `BinanceService`, which had three problems that all
 * showed up as sluggishness:
 *
 * 1. **It subscribed on every effect run.** `connectToTicker` pushed a freshly
 *    created closure onto a listeners array each time the component's effect
 *    fired, so the listener list grew without bound and one tick ended up
 *    triggering many state updates.
 * 2. **It re-parsed every frame into a fresh array and sorted it.** The store
 *    owns ordering now, and only pays for it when the order actually changes.
 * 3. **It looked symbols up with `Array.find`.** A hundred coins made that ten
 *    thousand comparisons a second, for a lookup a `Map` does in constant time.
 *
 * It also had no teardown: leaving the page left the socket open and reconnecting
 * on a timer. Here the connection is reference counted, so the last consumer to
 * leave closes it.
 */

const RECONNECT_MS = 5000;

/** Binance caps a combined stream at 1024 subscriptions. */
const MAX_STREAMS = 200;

@AppSignleton()
export class CoinStream {
  private socket: WebSocket | null = null;
  private url: string | null = null;
  private consumers = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** One entry per consumer, keyed by identity so teardown is exact. */
  private readonly handlers = new Set<(tick: BinanceTicker) => void>();

  constructor(private readonly store: CoinStore) {}

  /**
   * Subscribes to live ticks for `symbols`.
   *
   * Returns a teardown. The socket is opened on the first subscriber and closed
   * when the last one leaves, so navigating away actually disconnects instead of
   * leaving a connection and a reconnect timer behind.
   */
  connect(
    symbols: string[],
    onTick: (tick: BinanceTicker) => void,
  ): () => void {
    this.consumers += 1;
    this.handlers.add(onTick);

    const url = buildStreamUrl(symbols);
    if (url !== this.url || !this.socket) {
      this.url = url;
      this.open(url);
    }

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.handlers.delete(onTick);
      this.consumers = Math.max(0, this.consumers - 1);
      if (this.consumers === 0) this.close();
    };
  }

  private open(url: string): void {
    this.close();

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect(url);
      return;
    }
    this.socket = socket;

    socket.onmessage = (event: MessageEvent) => {
      const tick = parseFrame(event.data);
      if (!tick) return;
      // Applied to the store first so every consumer sees the same tick, and so
      // a single tick is parsed and applied once however many views exist.
      this.store.applyTick(tick);
      for (const handler of this.handlers) handler(tick);
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.scheduleReconnect(url);
    };

    socket.onerror = () => {
      // `onclose` follows `onerror`, so reconnect is handled in one place.
    };
  }

  private scheduleReconnect(url: string): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.consumers > 0) this.open(url);
    }, RECONNECT_MS);
  }

  private close(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    // Detach before closing so the handler cannot schedule a reconnect for a
    // connection that was closed on purpose.
    socket.onclose = null;
    socket.onmessage = null;
    socket.close();
  }
}

/**
 * Binance's combined-stream URL.
 *
 * `!ticker@arr` is deliberately **not** used: it asks the venue to push every
 * symbol it knows about and let the client discard most of them. A named
 * subscription means the venue only sends the hundred coins actually displayed.
 */
export function buildStreamUrl(symbols: string[]): string {
  const streams = [...new Set(symbols)]
    .slice(0, MAX_STREAMS)
    .map((symbol) => `${symbol.toLowerCase()}@ticker`)
    .join("/");
  return `wss://stream.binance.com:9443/stream?streams=${streams}`;
}

/**
 * Pulls the ticker out of a combined-stream frame.
 *
 * Binance sends either `{stream, data}` for a combined subscription or the bare
 * payload for a single one, so both shapes are accepted rather than assuming the
 * combined form the URL we build happens to use.
 */
export function parseFrame(raw: unknown): BinanceTicker | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as { data?: BinanceTicker } & BinanceTicker;
    const tick = parsed.data ?? parsed;
    if (typeof tick?.s !== "string" || !tick.s.endsWith("USDT")) return null;
    return tick;
  } catch {
    return null;
  }
}
