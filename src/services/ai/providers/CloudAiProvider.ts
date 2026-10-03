import "server-only";

import { env } from "~/env.js";
import { AxiosService } from "~/lib/axios";
import { AppInject, AppSignleton } from "~/lib/container";
import {
  AiError,
  type AiMessage,
  type AiProviderId,
  type AiResult,
} from "../ai.port";
import { BaseAiProvider } from "../BaseAiProvider";
import { OpenAiCompatibleProvider } from "../OpenAiCompatibleProvider";

type Env = Record<string, string | undefined>;

/** The vendors implemented in this file. */
export type AiVendor = "gemini" | "groq" | "openrouter";

type Vendor = AiVendor;

/**
 * Gemini's base, overridable for anyone fronting it with a corporate proxy.
 *
 * It also makes the provider testable: the shape of Gemini's response is not the
 * OpenAI one, so this is the one class in the file that cannot be verified by
 * pointing a mock at an OpenAI-shaped server.
 */
const GEMINI_URL =
  env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";

/** Default models, all on a free tier. */
const DEFAULTS: Record<Vendor, string> = {
  gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile",
  // The `:free` suffix routes to OpenRouter's no-cost model pool.
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
};

function firstNonEmpty(...values: (string | undefined)[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

/**
 * Groq and OpenRouter, both of which speak the OpenAI dialect.
 *
 * They are one class because the only difference between them is a base URL and
 * a key; splitting them would duplicate a transport that already exists in
 * {@link OpenAiCompatibleProvider} for no gain. Gemini is the odd one out and is
 * implemented directly against its own REST shape.
 */
export class OpenAiCompatibleVendorProvider extends OpenAiCompatibleProvider {
  readonly id: AiProviderId;

  readonly label: string;

  protected readonly baseUrl: string;

  protected readonly apiKey: string | null;

  protected readonly defaultModel: string | null;

  constructor(@AppInject(AxiosService) http: AxiosService, vendor: Vendor) {
    super(http);
    this.id = vendor;
    this.label = LABEL[vendor];
    this.apiKey = keyFor(vendor);
    this.baseUrl = URL[vendor];
    this.defaultModel = this.apiKey ? modelFor(vendor) : null;
  }

  get configured(): boolean {
    return this.apiKey !== null;
  }

  /**
   * A hosted vendor is unreachable because of the key or the network, not
   * because nothing is running locally.
   */
  protected override unreachableHint(): string {
    return `check ${this.id.toUpperCase()}_API_KEY and outbound network access.`;
  }

  /**
   * A 401 or 403 here means the key exists and was rejected, which the generic
   * "cannot reach" wording would hide behind a network explanation.
   */
  protected override unreachableCause(error: unknown): string {
    const status = statusOf(error);
    if (status === 401) return " — the API key was rejected";
    if (status === 403) return " — the API key was refused";
    if (status === 429) return " — the free tier rate limit was hit";
    return super.unreachableCause(error);
  }
}

/** Pulls the status off an axios rejection without depending on its type. */
function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return null;
  }
  const response = (error as { response?: unknown }).response;
  if (typeof response !== "object" || response === null) return null;
  const status = (response as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

const URL: Record<Vendor, string> = {
  gemini: GEMINI_URL,
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

const LABEL: Record<Vendor, string> = {
  gemini: "Gemini (free tier)",
  groq: "Groq (free tier)",
  openrouter: "OpenRouter (free model)",
};

function keyFor(vendor: Vendor, source: Env = process.env): string | null {
  if (vendor === "gemini") {
    return firstNonEmpty(source.GEMINI_API_KEY, source.GOOGLE_API_KEY);
  }
  if (vendor === "groq") return firstNonEmpty(source.GROQ_API_KEY);
  return firstNonEmpty(source.OPENROUTER_API_KEY);
}

function modelFor(vendor: Vendor, source: Env = process.env): string {
  const override = firstNonEmpty(
    vendor === "gemini"
      ? source.STATUSES_GEMINI_MODEL
      : vendor === "groq"
        ? source.STATUSES_GROQ_MODEL
        : source.STATUSES_OPENROUTER_MODEL,
  );
  return override ?? DEFAULTS[vendor];
}

/**
 * Google Gemini.
 *
 * The one provider that is not OpenAI-shaped: a different URL layout, a key in
 * the query string, `systemInstruction` instead of a system message, and no
 * `response_format`. It extends the base directly rather than forcing itself
 * into the OpenAI shape, which is the point of having a base class at all —
 * this one genuinely cannot be an `OpenAiCompatibleProvider`.
 */
@AppSignleton()
export class GeminiProvider extends BaseAiProvider {
  readonly id: AiProviderId = "gemini";

  readonly label = "Gemini (free tier)";

  private readonly key: string | null;

  private readonly model: string;

  constructor(@AppInject(AxiosService) http: AxiosService) {
    super(http);
    this.key = keyFor("gemini");
    this.model = modelFor("gemini");
  }

  get configured(): boolean {
    return this.key !== null;
  }

  /**
   * Lists Gemini's models, which is also the only cheap way to prove the key is
   * valid.
   *
   * The generation endpoint is per-model, so there is nothing to probe there —
   * but returning the configured model without asking anything would report
   * `online: true` for a typo'd key, and the user would find out by pressing the
   * button. This call costs one small request and turns that into a status the
   * panel can show.
   */
  protected override async fetchModels(): Promise<string[]> {
    if (!this.key) return [];

    const { data } = await this.http.get<{
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    }>(`${GEMINI_URL}/models?key=${encodeURIComponent(this.key)}`, {
      timeout: 5_000,
    });

    const models = (data?.models ?? [])
      // Gemini reports a model's own name as `models/<id>`, and lists models
      // that cannot generate at all.
      .filter((entry) =>
        (entry.supportedGenerationMethods ?? []).includes("generateContent"),
      )
      .map((entry) => (entry.name ?? "").replace(/^models\//, ""))
      .filter((id) => id !== "");

    if (models.length === 0) return [];

    // Prefer the configured model when the account can actually run it, rather
    // than reporting online and then failing on a default that is unavailable.
    return models.includes(this.model) ? [this.model, ...models] : models;
  }

  protected override async configuredModel(): Promise<string | null> {
    return this.key ? this.model : null;
  }

  protected override pickModel(models: string[]): string | null {
    return models[0] ?? null;
  }

  protected override defaultTimeoutMs(): number {
    return 30_000;
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
    if (!this.key) {
      throw AiError.invalidRequest(this.id, "generate without an API key");
    }

    // Gemini carries the system prompt out of band and takes the rest as turns.
    const system = request.messages.find((m) => m.role === "system");
    const turns = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const url =
      `${URL.gemini}/models/${encodeURIComponent(request.model)}` +
      `:generateContent?key=${encodeURIComponent(this.key)}`;

    const { data } = await this.http.post<{
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    }>(
      url,
      {
        ...(system
          ? { systemInstruction: { parts: [{ text: system.content }] } }
          : {}),
        contents: turns,
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
          // Gemini wants the word "JSON" in the prompt for JSON mode, which
          // every section's system prompt already contains.
          ...(request.json ? { responseMimeType: "application/json" } : {}),
        },
      },
      { timeout: timeoutMs, signal },
    );

    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
      "";

    return {
      text,
      usage: data.usageMetadata
        ? {
            inputTokens: data.usageMetadata.promptTokenCount ?? null,
            outputTokens: data.usageMetadata.candidatesTokenCount ?? null,
          }
        : null,
    };
  }
}

export default OpenAiCompatibleVendorProvider;
