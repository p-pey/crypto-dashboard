import "server-only";

import type { z } from "zod";

import { AxiosService } from "~/lib/axios";
import { AppInject } from "~/lib/container";

import {
  AiError,
  extractJsonObject,
  type AiJsonResult,
  type AiProviderId,
  type AiRequest,
  type AiResult,
  type AiStatus,
} from "./ai.port";

/**
 * Shared scaffolding for every model runtime.
 *
 * What lives here is only what genuinely is the same everywhere: the deadline,
 * the abort plumbing, the status cache, and the whole validate-and-clamp path
 * that turns a model's prose into a value a chart can render. Everything that
 * differs — the endpoint, the auth header, the payload shape, how a model id is
 * discovered — is left abstract, because those differences are the reason
 * providers exist.
 *
 * **Subclasses must not assume their own defaults for {@link fetchModels}.**
 * It throws here so that a runtime which cannot list models fails loudly at
 * boot rather than reporting "online" and then failing every completion.
 *
 * The two methods a subclass implements ({@link fetchModels} and
 * {@link sendChat}) are the entire transport. Everything a caller sees —
 * `probe`, `complete`, `completeJson` — is inherited.
 */
export abstract class BaseAiProvider {
  protected constructor(
    @AppInject(AxiosService) protected readonly http: AxiosService,
  ) {}

  /** Stable id, used for config lookup and for the UI's status line. */
  abstract readonly id: AiProviderId;

  /** Display name. */
  abstract readonly label: string;

  /** False when nothing is set up to answer, so the UI can hide the button. */
  abstract readonly configured: boolean;

  /**
   * A healthy runtime is cached for a minute; an unconfigured one barely at
   * all. Asymmetric on purpose: the common case is a user who has just started
   * a local runtime and wants the panel to notice without touching anything.
   */
  private static readonly TTL_ONLINE_MS = 60_000;
  private static readonly TTL_OFFLINE_MS = 10_000;

  private statusCache: { at: number; value: AiStatus } | null = null;
  /** De-duplicates concurrent probes so N panels cause one round trip. */
  private probeInFlight: Promise<AiStatus> | null = null;

  /**
   * Lists the models this runtime can use, or throws {@link AiError}.
   *
   * Returning an empty array means the runtime is running with nothing loaded,
   * which is reported as offline with a note rather than as an error.
   */
  protected abstract fetchModels(): Promise<string[]>;

  /** Performs the actual completion and returns the assistant's text. */
  protected abstract sendChat(
    request: Required<Pick<AiRequest, "model" | "messages">> & {
      temperature: number;
      maxTokens: number;
      json: boolean;
    },
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<{ text: string; usage: AiResult["usage"] }>;

  /** Default deadline. Local CPU generation is slow, so this is generous. */
  protected defaultTimeoutMs(): number {
    return 180_000;
  }

  /** The model to use when a request does not name one. */
  protected async resolveModel(requested?: string): Promise<string | null> {
    const configured = await this.configuredModel();
    const wanted = requested?.trim();
    if (wanted) return wanted;
    return configured;
  }

  /**
   * The provider's preferred model, discovered once per probe cycle.
   *
   * Subclasses that know their model from configuration alone can override this
   * and skip the model listing entirely on the completion path.
   */
  protected async configuredModel(): Promise<string | null> {
    const status = await this.probe();
    return status.model;
  }

  /**
   * Reachability and available models.
   *
   * Never throws: an unreachable runtime is `online: false` with a note, because
   * every caller wants to render "the model is off" rather than an error page.
   */
  async probe(options: { force?: boolean } = {}): Promise<AiStatus> {
    if (this.probeInFlight) return this.probeInFlight;

    const cached = this.statusCache;
    const ttl = cached?.value.online
      ? BaseAiProvider.TTL_ONLINE_MS
      : BaseAiProvider.TTL_OFFLINE_MS;
    if (!options.force && cached && Date.now() - cached.at < ttl) {
      return cached.value;
    }

    this.probeInFlight = this.runProbe().finally(() => {
      this.probeInFlight = null;
    });
    return this.probeInFlight;
  }

  private async runProbe(): Promise<AiStatus> {
    const startedAt = Date.now();
    let value: AiStatus;

    if (!this.configured) {
      value = {
        provider: this.id,
        label: this.label,
        online: false,
        model: null,
        models: [],
        latencyMs: null,
        error: `${this.label} is not configured`,
      };
    } else {
      try {
        const models = await this.fetchModels();
        value = {
          provider: this.id,
          label: this.label,
          online: models.length > 0,
          model: this.pickModel(models),
          models,
          latencyMs: Date.now() - startedAt,
          error:
            models.length === 0
              ? "the runtime is up but has no model loaded"
              : null,
        };
      } catch (error) {
        value = {
          provider: this.id,
          label: this.label,
          online: false,
          model: null,
          models: [],
          latencyMs: Date.now() - startedAt,
          error: describe(error),
        };
      }
    }

    this.statusCache = { at: Date.now(), value };
    return value;
  }

  protected pickModel(models: string[]): string | null {
    return models[0] ?? null;
  }

  /**
   * A plain completion.
   *
   * A failure is data, not an exception: the caller always gets a result and
   * branches on `error`, because every caller in this app has a deterministic
   * answer to fall back to.
   */
  async complete(
    request: AiRequest,
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<AiResult> {
    const startedAt = Date.now();
    const model = await this.resolveModel(request.model);

    if (!this.configured) {
      return this.failure(startedAt, null, `${this.label} is not configured`);
    }
    if (!model) {
      return this.failure(
        startedAt,
        null,
        `${this.label} has no model available`,
      );
    }
    if (request.messages.length === 0) {
      throw AiError.invalidRequest(this.id, "complete without any messages");
    }

    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs();
    const controller = new AbortController();
    // Our own deadline and a caller that went away both surface as an abort, so
    // they are tracked separately. Reporting a timeout as "cancelled" is worse
    // than reporting nothing: it sends the reader looking at the user instead of
    // at the model.
    let expired = false;
    const relay = () => controller.abort();
    options.signal?.addEventListener("abort", relay, { once: true });
    const timer = setTimeout(() => {
      expired = true;
      controller.abort();
    }, timeoutMs);

    try {
      const sent = await this.sendChat(
        {
          model,
          messages: request.messages,
          temperature: request.temperature ?? 0.2,
          maxTokens: request.maxTokens ?? 900,
          json: request.json ?? false,
        },
        timeoutMs,
        controller.signal,
      );

      const text = sent.text.trim();
      return {
        text: text.length > 0 ? text : null,
        provider: this.id,
        model,
        error: text.length > 0 ? null : "the model returned an empty reply",
        elapsedMs: Date.now() - startedAt,
        usage: sent.usage,
      };
    } catch (error) {
      return this.failure(
        startedAt,
        model,
        expired
          ? `timed out after ${Math.round(timeoutMs / 1000)}s — this model is slow on this hardware; use a smaller model or a GPU`
          : describe(error),
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", relay);
    }
  }

  /**
   * A completion validated against a schema.
   *
   * This is the method every structured feature should call. It exists so that
   * no caller ever writes `JSON.parse` on a model's output: extraction,
   * numeric coercion, validation, range clamping and truncation all happen here,
   * once, for every runtime.
   *
   * `normalise` is the section's last word — it is where a reply is forced into
   * shape no schema can express, such as three probabilities that must sum to
   * 100. It runs only on a reply that already validated.
   */
  async completeJson<T>(
    request: AiRequest,
    options: {
      schema: z.ZodType<T>;
      normalise?: (value: T) => T;
      timeoutMs?: number;
      signal?: AbortSignal;
      /** How much of a failed reply to keep for debugging. */
      keepRaw?: number;
    },
  ): Promise<AiJsonResult<T>> {
    const result = await this.complete(
      { ...request, json: true },
      { timeoutMs: options.timeoutMs, signal: options.signal },
    );

    if (!result.text) {
      return { ...result, data: null, raw: result.text };
    }

    const candidate = extractJsonObject(result.text);
    if (!candidate) {
      return {
        ...result,
        text: null,
        data: null,
        error: "the model did not return a JSON object",
        raw: result.text.slice(0, options.keepRaw ?? 2_000),
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      return {
        ...result,
        text: null,
        data: null,
        error: "the model's JSON could not be parsed",
        raw: result.text.slice(0, options.keepRaw ?? 2_000),
      };
    }

    const validated = options.schema.safeParse(parsed);
    if (!validated.success) {
      return {
        ...result,
        text: null,
        data: null,
        error: `unusable answer: ${validated.error.issues[0]?.message ?? "unexpected shape"}`,
        raw: result.text.slice(0, options.keepRaw ?? 2_000),
      };
    }

    return {
      ...result,
      text: null,
      data: options.normalise
        ? options.normalise(validated.data)
        : validated.data,
      error: null,
      raw: null,
    };
  }

  private failure(
    startedAt: number,
    model: string | null,
    error: string,
  ): AiResult {
    return {
      text: null,
      provider: this.id,
      model,
      error,
      elapsedMs: Date.now() - startedAt,
      usage: null,
    };
  }
}

/**
 * Turns anything a transport can throw into one sentence a user can act on.
 *
 * The important case is an HTTP error. Axios puts the server's own explanation in
 * `response.data`, and a bare "Request failed with status code 400" throws away
 * the only sentence that says what is actually wrong - which for a model server
 * is almost always "that model id is not loaded" or "that parameter is not
 * supported". So the body is surfaced, trimmed to something renderable.
 */
export function describe(error: unknown): string {
  const http = httpErrorOf(error);
  if (http) {
    return `${http.status} ${http.kind}: ${http.detail}`;
  }

  const code = codeOf(error);
  if (code === "ECONNREFUSED") return "cannot reach the model runtime";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return "cannot resolve the model runtime address";
  }
  if (code === "ECONNABORTED" || code === "ETIMEDOUT") {
    return "the model runtime timed out";
  }
  if (nameOf(error) === "AbortError" || nameOf(error) === "CanceledError") {
    return "the request was cancelled";
  }
  if (error instanceof Error) return error.message;
  return "the model runtime request failed";
}

/** What an HTTP failure is called, in the language the runtime would use. */
function httpKind(status: number): string {
  if (status === 400) return "bad request";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "no such endpoint or model";
  if (status === 413) return "prompt too long for this model's context";
  if (status === 422) return "the runtime rejected the request";
  if (status === 429) return "rate limited";
  if (status >= 500) return "the runtime failed";
  return "request failed";
}

/**
 * Pulls the server's own explanation out of an axios rejection.
 *
 * `data` is almost always an object with an `error` field that is itself either
 * a string or `{ message }`, which is the OpenAI dialect's convention, but a
 * misconfigured local server can return plain text or HTML instead.
 */
function httpErrorOf(
  error: unknown,
): { status: number; kind: string; detail: string } | null {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return null;
  }

  const response = (error as { response?: unknown }).response;
  if (typeof response !== "object" || response === null) return null;

  const status = (response as { status?: unknown }).status;
  if (typeof status !== "number") return null;

  const data = (response as { data?: unknown }).data;
  return {
    status,
    kind: httpKind(status),
    detail: extractDetail(data),
  };
}

function extractDetail(data: unknown): string {
  if (typeof data === "string" && data.trim() !== "") {
    return truncate(stripMarkup(data));
  }

  if (typeof data === "object" && data !== null) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === "string" && error.trim() !== "") {
      return truncate(error);
    }
    if (typeof error === "object" && error !== null) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message.trim() !== "") {
        return truncate(message);
      }
    }
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") {
      return truncate(message);
    }
  }

  return "the runtime gave no detail";
}

/**
 * Keeps a server's explanation readable in a one-line UI row.
 *
 * Long enough to identify the problem, short enough not to break the layout —
 * and with tags stripped, because an HTML error page rendered as text is noise.
 */
function truncate(value: string, limit = 220): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

function stripMarkup(value: string): string {
  if (!value.includes("<")) return value;
  return value.replace(/<[^>]*>/g, " ");
}

function codeOf(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function nameOf(error: unknown): string | null {
  if (error instanceof Error) return error.name;
  return null;
}
