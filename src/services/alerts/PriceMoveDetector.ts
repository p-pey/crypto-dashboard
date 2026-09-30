/**
 * Pump and dump detection.
 *
 * Deliberately pure and dependency free so the same rule runs in the browser
 * and on the server, and so it can be reasoned about without audio or DOM.
 *
 * The rule is "the price moved more than X% inside the lookback window". That
 * is not the same as a 24 hour change: a coin can be flat on the day and still
 * drop 4% in ninety seconds, which is the event worth waking someone for.
 */

export type PriceMove = {
  /** Stable identifier for the instrument, e.g. `BTC`. */
  key: string;
  /** Human readable name for the notification. */
  label: string;
  price: number;
  /** Percent move across the window, signed. */
  changePercent: number;
  /** The price the move is measured from. */
  reference: number;
  direction: "up" | "down";
  detectedAt: number;
};

export type MoveDetectorConfig = {
  /** Percent move that counts as a pump or a dump. */
  thresholdPercent: number;
  /** Window the move is measured over, in milliseconds. */
  windowMs: number;
  /**
   * How long to stay quiet for the same instrument and direction. Without it a
   * sustained trend fires continuously.
   */
  cooldownMs: number;
};

export const DEFAULT_MOVE_CONFIG: MoveDetectorConfig = {
  thresholdPercent: 1,
  windowMs: 60_000,
  cooldownMs: 10 * 60_000,
};

type Sample = { at: number; price: number };

type Tracked = {
  label: string;
  samples: Sample[];
  /** Direction and time of the last alert, for the cooldown. */
  mutedUntil: number;
  lastDirection: "up" | "down" | null;
};

/** Hard cap per instrument, so a long session cannot grow without bound. */
const MAX_SAMPLES = 600;

export class PriceMoveDetector {
  private readonly tracked = new Map<string, Tracked>();
  private config: MoveDetectorConfig;

  constructor(config: Partial<MoveDetectorConfig> = {}) {
    this.config = { ...DEFAULT_MOVE_CONFIG, ...config };
  }

  setConfig(config: Partial<MoveDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): MoveDetectorConfig {
    return this.config;
  }

  /**
   * Records a price and reports a move only when the threshold is crossed for
   * the first time. Once alerted, the same direction stays muted until the
   * cooldown expires, so a 3% slide raises one alert rather than sixty.
   */
  record(
    key: string,
    label: string,
    price: number,
    at = Date.now(),
  ): PriceMove | null {
    if (!Number.isFinite(price) || price <= 0) return null;

    const entry = this.tracked.get(key) ?? {
      label,
      samples: [],
      mutedUntil: 0,
      lastDirection: null,
    };
    entry.label = label;

    const previous = entry.samples[entry.samples.length - 1];
    if (previous?.price !== price) {
      entry.samples.push({ at, price });
      if (entry.samples.length > MAX_SAMPLES) {
        entry.samples.splice(0, entry.samples.length - MAX_SAMPLES);
      }
    }

    this.tracked.set(key, entry);

    // Everything older than the window is no longer a valid reference.
    const cutoff = at - this.config.windowMs;
    while (entry.samples.length > 0 && (entry.samples[0]?.at ?? 0) < cutoff) {
      entry.samples.shift();
    }

    const reference = entry.samples[0];
    if (!reference || entry.samples.length < 2) return null;

    const changePercent = ((price - reference.price) / reference.price) * 100;
    if (Math.abs(changePercent) < this.config.thresholdPercent) return null;

    const direction = changePercent > 0 ? "up" : "down";

    // A sustained move in the same direction is one event, not many.
    if (entry.lastDirection === direction && at < entry.mutedUntil) return null;

    entry.lastDirection = direction;
    entry.mutedUntil = at + this.config.cooldownMs;

    return {
      key,
      label: entry.label,
      price,
      reference: reference.price,
      changePercent,
      direction,
      detectedAt: at,
    };
  }

  /** Number of instruments currently being tracked, for the settings panel. */
  get size(): number {
    return this.tracked.size;
  }

  clear(): void {
    this.tracked.clear();
  }
}
