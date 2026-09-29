/**
 * Free-tier LLM access for the status narrative, with no added dependencies -
 * every provider is a plain `fetch` against its REST endpoint.
 *
 * Providers are tried in order and the first one with a key configured wins:
 *   1. Google Gemini   - free tier, most generous daily quota
 *   2. Groq            - free tier, very fast
 *   3. OpenRouter      - free `:free` models
 *
 * When none is configured (or every call fails) the caller falls back to the
 * deterministic narrative from `StatusScorer`.
 */

export type LlmProviderName = "gemini" | "groq" | "openrouter";

export type LlmConfig = {
  provider: LlmProviderName;
  label: string;
  model: string;
};

export type LlmResult = {
  text: string | null;
  provider: LlmProviderName | null;
  model: string | null;
  error: string | null;
};

type Env = Record<string, string | undefined>;

const DEFAULTS: Record<LlmProviderName, string> = {
  gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile",
  // `:free` suffix routes to OpenRouter's no-cost model pool.
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
};

function firstNonEmpty(...values: (string | undefined)[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

export function resolveLlmConfig(env: Env = process.env): LlmConfig | null {
  const geminiKey = firstNonEmpty(env.GEMINI_API_KEY, env.GOOGLE_API_KEY);
  if (geminiKey) {
    return {
      provider: "gemini",
      label: "Gemini (free tier)",
      model: firstNonEmpty(env.STATUSES_GEMINI_MODEL) ?? DEFAULTS.gemini,
    };
  }

  const groqKey = firstNonEmpty(env.GROQ_API_KEY);
  if (groqKey) {
    return {
      provider: "groq",
      label: "Groq (free tier)",
      model: firstNonEmpty(env.STATUSES_GROQ_MODEL) ?? DEFAULTS.groq,
    };
  }

  const openRouterKey = firstNonEmpty(env.OPENROUTER_API_KEY);
  if (openRouterKey) {
    return {
      provider: "openrouter",
      label: "OpenRouter (free model)",
      model:
        firstNonEmpty(env.STATUSES_OPENROUTER_MODEL) ?? DEFAULTS.openrouter,
    };
  }

  return null;
}

function extractGeminiText(payload: unknown): string | null {
  const candidates = (
    payload as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  )?.candidates;
  const text = candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  return text && text.length > 0 ? text : null;
}

function extractOpenAiText(payload: unknown): string | null {
  const choices = (
    payload as { choices?: { message?: { content?: string } }[] }
  )?.choices;
  const text = choices?.[0]?.message?.content?.trim();
  return text && text.length > 0 ? text : null;
}

function errorMessage(status: number, body: string): string {
  const snippet = body.replace(/\s+/g, " ").slice(0, 180);
  return `HTTP ${status}: ${snippet}`;
}

export async function completeWithLlm(
  config: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
  env: Env = process.env,
  timeoutMs = 20_000,
): Promise<LlmResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await dispatch(
      config,
      systemPrompt,
      userPrompt,
      env,
      controller.signal,
    );
    return {
      text: result.text,
      provider: config.provider,
      model: config.model,
      error: result.text ? null : result.error,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        text: null,
        provider: config.provider,
        model: config.model,
        error: `timed out after ${timeoutMs}ms`,
      };
    }
    return {
      text: null,
      provider: config.provider,
      model: config.model,
      error: error instanceof Error ? error.message : "llm request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function dispatch(
  config: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
  env: Env,
  signal: AbortSignal,
): Promise<{ text: string | null; error: string | null }> {
  if (config.provider === "gemini")
    return callGemini(config, systemPrompt, userPrompt, env, signal);
  if (config.provider === "groq")
    return callGroq(config, systemPrompt, userPrompt, env, signal);
  return callOpenRouter(config, systemPrompt, userPrompt, env, signal);
}

async function callGemini(
  config: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
  env: Env,
  signal: AbortSignal,
): Promise<{ text: string | null; error: string | null }> {
  const key = firstNonEmpty(env.GEMINI_API_KEY, env.GOOGLE_API_KEY);
  if (!key) return { text: null, error: "GEMINI_API_KEY missing" };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(key)}`;

  const response = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
    }),
  });

  const body = await response.text();
  if (!response.ok)
    return { text: null, error: errorMessage(response.status, body) };
  return { text: extractGeminiText(JSON.parse(body) as unknown), error: null };
}

async function callGroq(
  config: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
  env: Env,
  signal: AbortSignal,
): Promise<{ text: string | null; error: string | null }> {
  const key = firstNonEmpty(env.GROQ_API_KEY);
  if (!key) return { text: null, error: "GROQ_API_KEY missing" };

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.4,
        max_tokens: 400,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    },
  );

  const body = await response.text();
  if (!response.ok)
    return { text: null, error: errorMessage(response.status, body) };
  return {
    text: extractOpenAiText(JSON.parse(body) as unknown),
    error: null,
  };
}

async function callOpenRouter(
  config: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
  env: Env,
  signal: AbortSignal,
): Promise<{ text: string | null; error: string | null }> {
  const key = firstNonEmpty(env.OPENROUTER_API_KEY);
  if (!key) return { text: null, error: "OPENROUTER_API_KEY missing" };

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer":
          firstNonEmpty(env.STATUSES_SITE_URL) ?? "http://localhost:3000",
        "X-Title": "crypto-dashboard statuses",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.4,
        max_tokens: 400,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    },
  );

  const body = await response.text();
  if (!response.ok)
    return { text: null, error: errorMessage(response.status, body) };
  return {
    text: extractOpenAiText(JSON.parse(body) as unknown),
    error: null,
  };
}
