import "server-only";

import { AxiosService } from "~/lib/axios";
import { AppContainer } from "~/lib/container";
import {
  ExchangeError,
  type ExchangeErrorKind,
} from "~/services/trading/exchange.port";
import type { ExchangeId } from "~/services/trading/trading.types";

/**
 * The HTTP behaviour every exchange adapter shares.
 *
 * Four things here are not generic plumbing but direct consequences of how these
 * venues behave, and getting any of them wrong shows up as a rejected order or
 * a silently dropped fill:
 *
 * 1. **A business failure is not an HTTP failure.** Nobitex returns every
 *    business rejection with a 200 and a `status: "failed"` body, and BitUnix
 *    documents all of its error codes as `httpStatusCode: 200`. Keying off the
 *    status code alone would report success for a refused order.
 * 2. **Rate limits are per-IP and get you banned, not slowed.** Nobitex blocks
 *    an IP outright after 100 bad-token requests in half an hour, and Tabdeal
 *    documents no limits at all. So requests are spaced, not merely capped.
 * 3. **Order writes must never be retried blindly.** A timeout after the venue
 *    accepted the order is ambiguous, and a blind retry opens a second one. The
 *    client id makes a retry safe on the venues that support one; elsewhere the
 *    caller is told the write is ambiguous rather than having it repeated.
 * 4. **Money crosses as text.** Serialisation keeps `number` out of bodies
 *    entirely, so a 50,000,000,000 Rial price cannot lose precision in JSON.
 */

const Http = AppContainer.resolve(AxiosService);

const DEFAULT_TIMEOUT_MS = 15_000;

/** Identifies this app to venues that log by user agent. */
const USER_AGENT = "crypto-dashboard/1.0 (private single-operator client)";

export type HttpRequest = {
  exchange: ExchangeId;
  method: "GET" | "POST" | "DELETE";
  /** Absolute URL, or a path resolved against `baseUrl`. */
  url: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  /** Query parameters; values are stringified, never parsed as numbers. */
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON body. */
  body?: unknown;
  timeoutMs?: number;
  /**
   * Set false for anything that changes state, so a network failure surfaces
   * as an error instead of being retried into a duplicate order.
   */
  idempotent?: boolean;
  /** Retry budget for idempotent calls only. */
  retries?: number;
  /** Called before each attempt, for rate limiting and signing. */
  onAttempt?: (attempt: number) => void | Promise<void>;
};

function resolveUrl(request: HttpRequest): string {
  if (/^https?:\/\//i.test(request.url)) return request.url;
  const base = request.baseUrl ?? "";
  return `${base.replace(/\/$/, "")}/${request.url.replace(/^\//, "")}`;
}

/**
 * Serialises a value for a request body.
 *
 * JSON.stringify turns a decimal string into a JSON string, which is exactly
 * what these APIs document. Passing a `number` here would already have lost the
 * precision; this helper exists so that mistake is visible rather than silent.
 */
export function stringifyBody(body: unknown): string {
  if (typeof body === "string") return body;
  return JSON.stringify(body ?? {});
}

function classifyStatus(status: number): ExchangeErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 404 || status === 422) return "invalid_request";
  if (status >= 500) return "unavailable";
  return "unknown";
}

/** Pulls a venue-specific machine code out of whatever envelope came back. */
export function venueCodeOf(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const bag = payload as Record<string, unknown>;
  for (const key of ["code", "error", "errorCode", "errCode"]) {
    const value = bag[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number") return String(value);
  }
  // Wallex nests a numeric code next to a success flag.
  const success = bag.success;
  if (success === false && typeof bag.message === "string") return "rejected";
  return null;
}

/** Best-effort human message from any of the envelopes these venues use. */
export function venueMessageOf(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null) {
    const bag = payload as Record<string, unknown>;
    for (const key of ["message", "msg", "detail", "error_description"]) {
      const value = bag[key];
      if (typeof value === "string" && value.trim().length > 0) return value;
    }
    // Wallex returns a field -> messages map.
    const result = bag.result;
    if (typeof result === "object" && result !== null) {
      const first = Object.values(result as Record<string, unknown>)[0];
      if (typeof first === "string") return first;
    }
  }
  if (typeof payload === "string" && payload.trim().length > 0) return payload;
  return fallback;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof ExchangeError) return error.kind === "unavailable";
  const code = (error as { code?: string } | null)?.code;
  // Connection-level failures never reached the venue, so repeating them is
  // safe and is the only case where a retry cannot duplicate an order.
  return (
    code === "ECONNABORTED" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN"
  );
}

/**
 * Issues one request and returns the parsed body, or throws `ExchangeError`.
 *
 * A non-2xx response throws. A 2xx response is returned as-is even when it
 * carries a failure envelope, because only the adapter knows how to read its
 * own venue's envelope.
 */
export async function request<T>(req: HttpRequest): Promise<T> {
  const url = resolveUrl(req);
  const idempotent = req.idempotent !== false;
  const budget = idempotent ? (req.retries ?? 2) : 0;
  const serialized = req.body === undefined ? undefined : stringifyBody(req.body);

  let attempt = 0;
  for (;;) {
    if (req.onAttempt) await req.onAttempt(attempt);

    try {
      const response = await Http.instance.request<T>({
        method: req.method,
        url,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          ...(serialized === undefined
            ? {}
            : { "Content-Type": "application/json" }),
          ...req.headers,
        },
        params: req.query,
        data: serialized,
        timeout: req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });

      return response.data;
    } catch (error) {
      const status =
        (error as { response?: { status?: number } } | null)?.response?.status ??
        undefined;
      const payload = (error as { response?: { data?: unknown } } | null)?.response
        ?.data;
      const kind = status === undefined ? "unavailable" : classifyStatus(status);

      const failure = new ExchangeError(
        req.exchange,
        kind,
        venueMessageOf(payload, `${req.exchange} ${req.method} failed`),
        venueCodeOf(payload),
        status === 429 ? 5 : null,
        { cause: error },
      );

      if (attempt >= budget || !isRetryable(error)) throw failure;
      attempt += 1;
      // 400ms, 1.2s. Long enough that a venue's geo-block or a transient 503 is
      // not hammered, short enough that an order attempt stays interactive.
      await new Promise((resolve) => setTimeout(resolve, 400 * 3 ** (attempt - 1)));
    }
  }
}

/**
 * Per-venue minimum gap between requests.
 *
 * Not a throughput optimisation. Nobitex bans an IP for two minutes after too
 * many unauthenticated or over-limit calls, and Tabdeal publishes no limits at
 * all, so the only safe assumption is to be slow. Public market metadata is on
 * a much longer interval than anything transactional.
 */
export const MIN_SPACING_MS: Record<ExchangeId, { read: number; write: number }> = {
  nobitex: { read: 350, write: 400 },
  wallex: { read: 500, write: 900 },
  bitpin: { read: 750, write: 900 },
  tabdeal: { read: 400, write: 700 },
  bitunix: { read: 200, write: 200 },
};

/**
 * A crude serialising rate limiter: one request at a time, spaced by `gapMs`.
 *
 * Chosen over a token bucket because the constraint these venues impose is a
 * hard ceiling they will enforce by blocking an IP, not a soft quota. Being
 * slower than necessary costs a little latency; being faster costs access.
 */
export class Pacer {
  private chain: Promise<unknown> = Promise.resolve();
  private last = 0;

  constructor(private readonly gapMs: number) {}

  /** Queues `task` behind everything already scheduled. */
  schedule<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(async () => {
      const wait = this.last + this.gapMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.last = Date.now();
      return task();
    });
    // Keep the chain alive even when a task rejects.
    this.chain = next.catch(() => undefined);
    return next;
  }
}
