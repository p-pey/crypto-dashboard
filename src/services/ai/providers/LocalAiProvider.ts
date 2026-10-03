import "server-only";

import { env } from "~/env.js";
import { AxiosService } from "~/lib/axios";
import { AppInject, AppSignleton } from "~/lib/container";
import { AiError, type AiProviderId } from "../ai.port";
import {
  OpenAiCompatibleProvider,
  type JsonMode,
} from "../OpenAiCompatibleProvider";

/** Named so the getter reads as a statement rather than a bare literal. */
const ALWAYS_CONFIGURED = true;

/** LM Studio's own default. Ollama's is 11434 and has to be configured. */
const DEFAULT_BASE_URL = "http://127.0.0.1:1234";

/**
 * A model running on this machine, reached over its OpenAI-compatible server.
 *
 * Covers LM Studio and Ollama with no branching between them, because they
 * genuinely are the same dialect: `GET /models`, `POST /chat/completions`, and
 * `response_format` for JSON mode. The only real difference is the port, and
 * that belongs in configuration rather than in code.
 *
 * It is the default provider because it is the only one that needs no key and no
 * network, which is the point of this app: a read never has to leave the box.
 *
 * **The one behavioural difference that matters.** LM Studio's `/models` lists
 * only what is currently loaded into memory, so "first listed" is a sane
 * default. Ollama's lists every model you have ever pulled, loads lazily, and
 * returns them in no useful order — so "first listed" there can be a 1B model
 * or an embedding model. That is why pinning `LOCAL_LLM_MODEL` is strongly
 * recommended with Ollama, and why a pinned-but-absent model is reported rather
 * than silently swapped.
 */
@AppSignleton()
export default class LocalAiProvider extends OpenAiCompatibleProvider {
  readonly id: AiProviderId = "local";

  readonly label = "Local runtime (LM Studio / Ollama)";

  protected readonly baseUrl: string =
    env.LOCAL_LLM_BASE_URL ?? env.LMSTUDIO_BASE_URL ?? DEFAULT_BASE_URL;

  protected readonly apiKey: string | null =
    env.LOCAL_LLM_API_KEY ?? env.LMSTUDIO_API_KEY ?? null;

  protected readonly defaultModel: string | null =
    env.LOCAL_LLM_MODEL ?? env.LMSTUDIO_MODEL ?? null;

  /**
   * Always configured.
   *
   * There is no key to be missing and a loopback address is always meaningful;
   * whether a runtime is actually listening is what {@link probe} answers, and
   * it answers without throwing.
   */
  get configured(): boolean {
    return ALWAYS_CONFIGURED;
  }

  /**
   * Honoured only when configured.
   *
   * LM Studio wants `json_schema`, which needs a real schema to constrain
   * against, and this provider has no way to turn the section's zod schema into
   * one. So `schema` is accepted as a setting for runtimes that can do it, and
   * anything else is best left off: the prompt plus validation already work.
   */
  protected override jsonMode(): JsonMode {
    return env.LOCAL_LLM_JSON_MODE ?? "off";
  }

  /**
   * Fifteen minutes, which is not a guess.
   *
   * Measured on this project' own development box — a 16-core Intel Core Ultra
   * with no discrete GPU — a 9B model generates at roughly 4 tokens/second, so a
   * 700-token structured answer plus prompt prefill takes about three minutes.
   * A 180 second deadline failed requests that were about to succeed, and the
   * figure scales with the model: a 30B on the same CPU would not finish at all.
   *
   * A GPU changes this by an order of magnitude. There is no way to detect that
   * here, so the generous ceiling stands and the user is told to expect a wait.
   */
  protected override defaultTimeoutMs(): number {
    return 900_000;
  }

  /**
   * Reports a pinned model that the runtime does not have.
   *
   * The fall-through to another model is the right behaviour — refusing to run
   * because of a typo in a config value would be worse — but staying silent
   * about it means a user asking "why is it answering as `nomic-embed-text`"
   * has nothing to go on. So the mismatch becomes the status note.
   */
  protected override async fetchModels(): Promise<string[]> {
    const models = await super.fetchModels();
    const pinned = this.defaultModel?.trim();

    if (pinned && models.length > 0 && !models.includes(pinned)) {
      throw new AiError(
        this.id,
        "not_configured",
        `${pinned} is pinned but not available; pull or load it, or unset LOCAL_LLM_MODEL`,
      );
    }

    return models;
  }

  constructor(@AppInject(AxiosService) http: AxiosService) {
    super(http);
  }
}
