type CentrifugoFrame = {
  id?: number;
  connect?: { client?: string; version?: string };
  subscribe?: { channel: string; recoverable?: boolean };
  push?: { channel: string; pub: { data?: unknown } };
  error?: { code?: number; message?: string };
  result?: unknown;
};

export type CentrifugoOptions = {
  url: string;
  channels: string[];
  onData: (channel: string, data: unknown) => void;
  onStatus: (status: "connecting" | "open" | "closed") => void;
  /** Cap for the exponential reconnect backoff, in milliseconds. */
  maxBackoffMs?: number;
};

const PING_PONG_FRAME = "{}";
const BASE_BACKOFF_MS = 1_000;

/**
 * Minimal Centrifugal client speaking the plain JSON protocol over a native
 * `WebSocket`, so Nobitex and Bitpin need no extra dependency.
 *
 * Only the frames the order book channels need are handled: connect,
 * subscribe, push and ping/pong. Deltas are not requested, every publication
 * therefore carries a full order book which is what the UI renders anyway.
 */
export class CentrifugoClient {
  private readonly options: CentrifugoOptions;
  private socket: WebSocket | null = null;
  private nextId = 1;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  constructor(options: CentrifugoOptions) {
    this.options = options;
  }

  connect() {
    if (this.socket) return;

    this.intentionalClose = false;
    this.options.onStatus("connecting");

    try {
      this.socket = new WebSocket(this.options.url);
    } catch {
      this.socket = null;
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => this.handleOpen();
    this.socket.onmessage = (event: MessageEvent<string>) =>
      this.handleMessage(event.data);
    this.socket.onerror = () => {
      this.options.onStatus("closed");
    };
    this.socket.onclose = () => {
      this.options.onStatus("closed");
      this.socket = null;
      if (!this.intentionalClose) this.scheduleReconnect();
    };
  }

  close() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    this.options.onStatus("closed");
  }

  private handleOpen() {
    this.attempts = 0;
    this.options.onStatus("open");
    this.send({ id: this.allocateId(), connect: {} });
  }

  private handleMessage(raw: string) {
    // Centrifugo server side ping is an empty JSON object, reply with a pong
    // before the 25s deadline or the connection is dropped.
    if (raw === PING_PONG_FRAME || raw.trim() === "") {
      this.sendRaw(PING_PONG_FRAME);
      return;
    }

    let frame: CentrifugoFrame;
    try {
      frame = JSON.parse(raw) as CentrifugoFrame;
    } catch {
      return;
    }

    if (frame.error) {
      return;
    }

    if (frame.connect) {
      for (const channel of this.options.channels) {
        this.send({ id: this.allocateId(), subscribe: { channel } });
      }
      return;
    }

    if (frame.push?.channel) {
      this.options.onData(frame.push.channel, frame.push.pub?.data);
    }
  }

  private send(frame: CentrifugoFrame) {
    this.sendRaw(JSON.stringify(frame));
  }

  private sendRaw(payload: string) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
    }
  }

  private allocateId() {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  private scheduleReconnect() {
    if (this.intentionalClose || this.reconnectTimer) return;

    const maxBackoff = this.options.maxBackoffMs ?? 15_000;
    const delay = Math.min(BASE_BACKOFF_MS * 2 ** this.attempts, maxBackoff);
    this.attempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
