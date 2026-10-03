import "server-only";

import { z } from "zod";

import type { AiProviderId as ClientAiProviderId } from "./providerId";

/**
 * The single seam between this application and any language model.
 *
 * Everything above this interface is written against prompts and typed output
 * and has no idea which runtime is answering. Everything below it is one
 * provider per runtime, and each one owns the full breadth of that runtime's
 * peculiarities: where it listens, how it authenticates, how it names models,
 * whether it can be constrained to emit JSON, and how quickly it answers.
 *
 * That list is why this is a port and not a base class. The differences between
 * a laptop running LM Studio and a free-tier Gemini key are genuine
 * incompatibility, not missing implementation, and pretending otherwise would
 * push branching into every caller.
 *
 * **This module is deliberately standalone.** It imports nothing from any
 * feature or domain, so the AI layer can be extended, swapped or deleted
 * without a domain ever having to know. Adding a section that needs a model
 * means extending `BaseAiSection`, not editing anything in here.
 *
 * Contract for implementors:
 *
 * - **Never throw for an ordinary failure.** A model that is switched off, has
 *   no key, times out or answers with nonsense is a populated `error` on the
 *   result, not an exception. Every caller in this app has a deterministic
 *   fallback to fall back to, and an exception would take that down with it.
 * - **Raise {@link AiError} only for programming errors** — a provider asked to
 *   send a request with no messages, for instance.
 * - **Validate, do not trust.** `completeJson` exists so that no caller ever
 *   parses a model's reply by hand. Providers must route structured answers
 *   through it.
 * - **Report provenance.** Every result carries the provider id and the model
 *   that answered, because a verdict without knowing which model produced it is
 *   not worth showing.
 */

/** Every runtime this app knows how to talk to. */
export type AiProviderId = "local" | "gemini" | "groq" | "openrouter";

/**
 * The client renders these ids from `~/services/ai/providerId`, which cannot
 * import this module. The assertion below fails to compile the moment the two
 * unions drift apart, which is the whole reason the mirror is safe to have.
 */
export type _AssertClientMirrorMatches = AiProviderId extends ClientAiProviderId
  ? ClientAiProviderId extends AiProviderId
    ? true
    : never
  : never;

/**
 * The feature areas that ask a model for something.
 *
 * A section is the unit of caching, of timeout policy and of "is this worth
 * retrying". Two sections may want completely different sampling settings — the
 * status brief wants prose, the macro read wants a schema — and they get them
 * without either knowing about the other's prompts.
 */
export type AiSectionId = "analyze" | "statuses";

export type AiRole = "system" | "user" | "assistant";

export type AiMessage = {
  role: AiRole;
  content: string;
};

/**
 * A completion request.
 *
 * Deliberately minimal and runtime-agnostic: there is no `response_format`, no
 * `top_p` and no vendor-specific knob here. A provider translates what it
 * supports and ignores the rest, so a section can be pointed at a different
 * runtime without editing the section.
 */
export type AiRequest = {
  /** Overrides the provider's default model when set. */
  model?: string;
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
  /**
   * Ask the runtime to constrain the reply to a JSON object where it can.
   * A hint, not a guarantee: `completeJson` validates regardless, because plenty
   * of runtimes ignore this or support it only under a flag.
   */
  json?: boolean;
};

export type AiResult = {
  /** The model's text, or null when there was none. */
  text: string | null;
  provider: AiProviderId;
  model: string | null;
  /** Human-readable and safe to show. Null on success. */
  error: string | null;
  /** Wall clock for the call, for the "answered in Ns" line. */
  elapsedMs: number;
  /** Usage counters when the runtime reports them, which many do not. */
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
};

export type AiJsonResult<T> = AiResult & {
  /** Present only when the reply validated against the schema. */
  data: T | null;
  /**
   * The untruncated reply, kept when parsing failed.
   *
   * Surfacing it rather than discarding it is the difference between "the model
   * is misbehaving" and a five-minute debugging session guessing what it said.
   */
  raw: string | null;
};

/** What a runtime reports about itself. */
export type AiStatus = {
  provider: AiProviderId;
  label: string;
  /** True when a completion could plausibly succeed right now. */
  online: boolean;
  /** The model that would be used: the configured one, else the provider default. */
  model: string | null;
  /** Every model this provider can currently use. */
  models: string[];
  /** Round trip to the runtime's health endpoint. */
  latencyMs: number | null;
  /** Safe to show verbatim. Null when online. */
  error: string | null;
};

/**
 * Why a model call failed.
 *
 * - `not_configured` - no endpoint, no key, or the runtime is not running
 * - `invalid_request` - the request was structurally wrong, i.e. a bug on our side
 * - `timeout` - ran past its deadline
 * - `cancelled` - the caller went away, usually a navigation
 * - `invalid_response` - the reply did not match the schema
 * - `unavailable` - 5xx, connection reset, DNS failure or geo-block
 */
export type AiErrorKind =
  | "not_configured"
  | "invalid_request"
  | "timeout"
  | "cancelled"
  | "invalid_response"
  | "unavailable";

/**
 * The one error type that crosses the seam.
 *
 * Thrown only for programming errors; every ordinary failure travels as an
 * `error` string on the result instead.
 */
export class AiError extends Error {
  constructor(
    readonly provider: AiProviderId,
    readonly kind: AiErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AiError";
  }

  static invalidRequest(provider: AiProviderId, what: string): AiError {
    return new AiError(
      provider,
      "invalid_request",
      `${provider} was asked to ${what}`,
    );
  }
}

export function isAiError(value: unknown): value is AiError {
  return value instanceof AiError;
}

/**
 * A zod number that accepts the things small models actually emit.
 *
 * A 7B model asked for a percentage answers `"84%"` roughly as often as `84`,
 * and sometimes `"1,200"`. Rejecting an otherwise usable read over a quoted
 * number is the wrong trade, so numeric-looking strings are coerced before
 * validation. Anything genuinely non-numeric still fails, because silently
 * turning garbage into `0` would be worse than an error.
 */
export function aiNumber() {
  return z.preprocess((value) => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value.replace(/[%,\s]/g, ""));
      return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
  }, z.number());
}

/**
 * Pulls the first JSON object out of a reply.
 *
 * Small models fence their output, prefix it with a sentence, or emit trailing
 * commentary. Constrained decoding prevents most of this and not all of it.
 */
export function extractJsonObject(raw: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const body = fenced?.[1] ?? raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return body.slice(start, end + 1);
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}
