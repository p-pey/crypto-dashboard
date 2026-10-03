import "server-only";

import { AiError, type AiMessage, type AiResult } from "./ai.port";
import { BaseAiProvider, describe } from "./BaseAiProvider";

/**
 * Shared transport for every runtime that speaks the OpenAI REST dialect.
 *
 * LM Studio, Ollama, llama.cpp's server, Groq and OpenRouter all expose
 * `GET /models` and `POST /chat/completions` with the same field names. That is
 * a large enough overlap to be worth inheriting rather than repeating: five
 * providers differ only in their base URL, their key and their default model.
 *
 * Subclasses supply those three things and, optionally, a way to override how a
 * model id is chosen. Anyone implementing an OpenAI-compatible runtime should
 * extend this rather than `BaseAiProvider` directly.
 */
export abstract class OpenAiCompatibleProvider extends BaseAiProvider {
  /** Must end without a trailing slash. `/v1` is appended when absent. */
  protected abstract readonly baseUrl: string;

  /** Sent as `Authorization: Bearer`. Null when the runtime needs no key. */
  protected abstract readonly apiKey: string | null;

  /** Used when the runtime reports several models and none is pinned. */
  protected abstract readonly defaultModel: string | null;

  /**
   * How to ask for JSON, if at all.
   *
   * `"off"` is the default and it is not timidity — it is that the field is not
   * portable. The OpenAI dialect's `response_format: {"type":"json_object"}` is
   * accepted by Groq and OpenRouter and **rejected outright by LM Studio**,
   * which wants `json_schema` or `text` and answers 400 to anything else. A
   * provider that knows its runtime can override this; one that does not is
   * better off relying on the prompt plus validation, which works everywhere.
   */
  protected jsonMode(): JsonMode {
    return "off";
  }

  /**
   * Records that this runtime rejected our JSON mode, so we stop asking.
   *
   * Set from the 400 handler below. Without this, a runtime that refuses the
   * field would fail *every* structured request forever rather than degrading to
   * one that works — the prompt still asks for one JSON object, and the parser
   * still extracts and validates it.
   */
  private jsonModeDisabled = false;

  /**
   * What to check when this provider cannot be reached.
   *
   * Overridden because the two families of provider fail for entirely different
   * reasons, and telling a cloud user to check whether their runtime is running
   * is worse than saying nothing at all.
   */
  protected unreachableHint(): string {
    return "is the runtime started, and is it on this machine?";
  }

  /** The transport's own reason, when it adds anything to the hint. */
  protected unreachableCause(error: unknown): string {
    const detail = describe(error);
    return detail.startsWith("cannot reach") ? "" : ` (${detail})`;
  }

  protected headers(): Record<string, string> {
    // Local runtimes ignore auth by default, but the server can be started
    // with a key and several OpenAI-compatible front ends expect one.
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
  }

  /**
   * The dialect's model listing.
   *
   * A bare host is tolerated because that is how every one of these runtimes
   * prints its address in its own UI, and requiring `/v1` would be a papercut
   * paid on every paste.
   */
  protected normalisedBaseUrl(): string {
    const trimmed = this.baseUrl.replace(/\/+$/, "");
    return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
  }

  protected override async fetchModels(): Promise<string[]> {
    const url = `${this.normalisedBaseUrl()}/models`;

    let data: { data?: { id?: string }[] };
    try {
      ({ data } = await this.http.get<{ data?: { id?: string }[] }>(url, {
        timeout: 2_500,
        headers: this.headers(),
      }));
    } catch (error) {
      // Naming the address that was actually tried is the difference between a
      // one-line fix and a guessing game, because the most common cause is a
      // runtime on a different machine than the one serving the app.
      throw new AiError(
        this.id,
        "unavailable",
        `cannot reach ${url} — ${this.unreachableHint()}${this.unreachableCause(error)}`,
        { cause: error },
      );
    }

    return (data?.data ?? [])
      .map((entry) => entry?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  }

  /**
   * Prefers a pinned model, but only if it is actually loaded.
   *
   * An exact miss is a configuration error worth surfacing, yet failing the whole
   * call over it would be worse than running the model that is loaded — so a
   * miss falls through to the first available one.
   */
  protected override pickModel(models: string[]): string | null {
    const pinned = this.defaultModel?.trim();
    if (pinned && models.includes(pinned)) return pinned;
    return models[0] ?? null;
  }

  protected override async configuredModel(): Promise<string | null> {
    // A pinned model needs no listing on the completion path; that is what keeps
    // a configured cloud key from paying for a probe on every single call.
    const pinned = this.defaultModel?.trim();
    if (pinned) return pinned;
    const status = await this.probe();
    return status.model;
  }

  protected override async sendChat(
    request: {
      model: string;
      messages: AiMessage[];
      temperature: number;
      maxTokens: number;
      json: boolean;
    },
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<{ text: string; usage: AiResult["usage"] }> {
    const responseFormat =
      request.json && !this.jsonModeDisabled
        ? responseFormatFor(this.jsonMode())
        : null;

    let data:
      | {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        }
      | string;

    try {
      ({ data } = await this.http.post<
        | {
            choices?: { message?: { content?: string } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          }
        | string
      >(
        `${this.normalisedBaseUrl()}/chat/completions`,
        {
          model: request.model,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          ...(responseFormat ? { response_format: responseFormat } : {}),
          messages: request.messages,
        },
        { timeout: timeoutMs, signal, headers: this.headers() },
      ));
    } catch (error) {
      // One bad field should cost one request, not every request from now on.
      if (responseFormat && complainsAboutResponseFormat(error)) {
        this.jsonModeDisabled = true;
      }
      throw error;
    }

    // Some runtimes answer 200 with a plain-text error page.
    if (typeof data === "string") {
      throw new AiError(
        this.id,
        "unavailable",
        `${this.label} returned a non-JSON response: ${data.slice(0, 120)}`,
      );
    }

    const text = data.choices?.[0]?.message?.content ?? "";
    return {
      text,
      usage: data.usage
        ? {
            inputTokens: data.usage.prompt_tokens ?? null,
            outputTokens: data.usage.completion_tokens ?? null,
          }
        : null,
    };
  }
}

export { describe };

/** The three states of a runtime's support for constrained JSON output. */
export type JsonMode = "off" | "object" | "schema";

function responseFormatFor(mode: JsonMode): Record<string, unknown> | null {
  if (mode === "object") return { type: "json_object" };
  if (mode === "schema") return { type: "json_schema" };
  return null;
}

/**
 * Recognises the specific complaint, rather than disabling JSON mode on any 400.
 *
 * A 400 could equally be an oversized prompt or a bad model id, and silencing
 * JSON mode for those would hide a real problem behind a silent downgrade.
 */
function complainsAboutResponseFormat(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return false;
  }
  const response = (error as { response?: unknown }).response;
  if (typeof response !== "object" || response === null) return false;

  const body = (response as { data?: unknown }).data;
  const text =
    typeof body === "string"
      ? body
      : JSON.stringify(
          (body as { error?: unknown } | null)?.error ?? body ?? "",
        );
  return /response_format|json_schema|json_object/i.test(text);
}
