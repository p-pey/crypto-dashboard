import "server-only";

/**
 * The caching contract every upstream source in this app follows, in one place.
 *
 * Each free source needs the same three things, and re-deriving them per service
 * is how they end up inconsistent:
 *
 * - a **TTL**, because the free tiers are priced against request volume and a
 *   refresh loop that ignores that gets throttled;
 * - an **inflight de-duplicator**, because a panel mounting, a second tab and a
 *   prefetch all arrive together and would otherwise be three upstream calls for
 *   the same second;
 * - a **last-good-read fallback**, because a crawler that returns null on
 *   failure makes every panel blink on every refresh. A stale figure with an
 *   honest `stale: true` beats a blank one.
 *
 * `docs/feature-catalog.md` proposes roughly twenty new sources; without this
 * the third one would already differ from the first two.
 */
export type SourceEnvelope<T> = {
  data: T;
  fetchedAt: number;
  /** True when `data` is an earlier successful read served after a failure. */
  stale: boolean;
  /** Human-readable reason for the most recent failure, if any. */
  error: string | null;
};

export type CachedSourceOptions<T> = {
  /** How long a successful read is served without touching upstream. */
  ttlMs: number;
  /** Loads fresh data. Must throw rather than return null on failure. */
  load: () => Promise<T>;
  /**
   * Whether the last good read is still usable for this source.
   *
   * True for a market snapshot where a two-minute-old price is fine, false for
   * an alert evaluation where acting on a stale trigger is worse than not
   * acting at all.
   */
  staleWhileRefreshing?: boolean;
  /** Reported to the UI when there is no previous read to fall back on. */
  empty: () => T;
};

export class CachedSource<T> {
  private cache: { data: T; fetchedAt: number; expiresAt: number } | null =
    null;
  private inflight: Promise<SourceEnvelope<T>> | null = null;
  private lastError: string | null = null;

  private readonly ttlMs: number;
  private readonly load: () => Promise<T>;
  private readonly staleWhileRefreshing: boolean;
  private readonly empty: () => T;

  constructor(options: CachedSourceOptions<T>) {
    this.ttlMs = options.ttlMs;
    this.load = options.load;
    this.staleWhileRefreshing = options.staleWhileRefreshing ?? true;
    this.empty = options.empty;
  }

  async read(options: { force?: boolean } = {}): Promise<SourceEnvelope<T>> {
    const now = Date.now();

    if (
      !options.force &&
      this.cache &&
      this.cache.expiresAt > now &&
      this.lastError === null
    ) {
      return {
        data: this.cache.data,
        fetchedAt: this.cache.fetchedAt,
        stale: false,
        error: null,
      };
    }

    // One upstream call serves every concurrent caller.
    if (this.inflight) return this.inflight;

    this.inflight = this.refresh().finally(() => {
      this.inflight = null;
    });

    return this.inflight;
  }

  private async refresh(): Promise<SourceEnvelope<T>> {
    try {
      const data = await this.load();
      const fetchedAt = Date.now();

      this.cache = { data, fetchedAt, expiresAt: fetchedAt + this.ttlMs };
      this.lastError = null;

      return { data, fetchedAt, stale: false, error: null };
    } catch (error) {
      const message = describeError(error);
      this.lastError = message;

      const previous = this.cache;
      if (previous && this.staleWhileRefreshing) {
        return {
          data: previous.data,
          fetchedAt: previous.fetchedAt,
          stale: true,
          error: message,
        };
      }

      return {
        data: this.empty(),
        fetchedAt: Date.now(),
        stale: true,
        error: message,
      };
    }
  }
}

/**
 * Normalises whatever an HTTP client threw into a short sentence.
 *
 * Kept short on purpose: this string is rendered in a pill tooltip, and a
 * two-line stack trace there is worse than no tooltip.
 */
export function describeError(error: unknown, fallback = "request failed"): string {
  if (error instanceof Error) {
    const message = error.message;
    if (
      message.includes("ECONNABORTED") ||
      message.includes("timeout") ||
      message.includes("ETIMEDOUT")
    ) {
      return "timed out";
    }
    // axios puts the upstream status code here; a 403 is a reachability fact
    // about this host and saying so is more useful than "Request failed".
    const status = extractStatus(message);
    if (status !== null) return `HTTP ${status}`;
    return message || fallback;
  }
  return fallback;
}

function extractStatus(message: string): number | null {
  const match = /\b(4\d{2}|5\d{2})\b/.exec(message);
  if (!match?.[1]) return null;
  const status = Number.parseInt(match[1], 10);
  // A bare number in the middle of a message is often a port or a byte count,
  // so only treat it as a status when the message looks like an HTTP failure.
  return /status|request failed|forbidden|unauthorized|not found|bad gateway/i.test(
    message,
  )
    ? status
    : null;
}

/**
 * A `0..1` or `-1..1` fraction, guarded.
 *
 * Sources routinely publish `null`, `""` and `NaN` in the same field, and one of
 * those reaching a division produces `Infinity` that renders as a plausible
 * looking number.
 */
export function safeRatio(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  const ratio = numerator / denominator;
  return Number.isFinite(ratio) ? ratio : null;
}

/** Coerces a source's number-ish field to a finite number, or null. */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}