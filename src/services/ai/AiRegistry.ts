import "server-only";

import { env } from "~/env.js";
import { AxiosService } from "~/lib/axios";
import { AppContainer } from "~/lib/container";
import { AiError, type AiProviderId, type AiStatus } from "./ai.port";
import type { BaseAiProvider } from "./BaseAiProvider";
import {
  GeminiProvider,
  OpenAiCompatibleVendorProvider,
  type AiVendor,
} from "./providers/CloudAiProvider";
import LocalAiProvider from "./providers/LocalAiProvider";

/**
 * The one place that knows which runtime can answer.
 *
 * Adding a runtime is a single entry in {@link PROVIDER_IDS} plus a class;
 * nothing above this file changes. That is the whole point of the port: a
 * section resolves a provider through this registry and never imports one.
 *
 * **Order is a deliberate product decision, not a preference.** The local
 * runtime comes first because this app exists so that a read never has to leave
 * the machine. Cloud keys still work and are still picked up automatically —
 * but only when no local model is loaded, which is a state the user reaches by
 * deliberately closing LM Studio.
 */
const PROVIDER_IDS: readonly AiProviderId[] = [
  "local",
  "gemini",
  "groq",
  "openrouter",
];

/** The two OpenAI-shaped vendors, which differ only by URL and key. */
const OPENAI_VENDORS: readonly AiVendor[] = ["groq", "openrouter"];

class Registry {
  private readonly providers = new Map<AiProviderId, BaseAiProvider>();

  constructor() {
    // One Axios instance for every provider, so the connection pool and the
    // interceptors are shared rather than duplicated per runtime.
    const http = AppContainer.resolve(AxiosService);

    const local = new LocalAiProvider(http);
    const gemini = new GeminiProvider(http);

    this.providers.set(local.id, local);
    this.providers.set(gemini.id, gemini);

    for (const vendor of OPENAI_VENDORS) {
      const provider = new OpenAiCompatibleVendorProvider(http, vendor);
      this.providers.set(provider.id, provider);
    }
  }

  has(id: AiProviderId): boolean {
    return this.providers.has(id);
  }

  /** Throws rather than returning null, so a bad id can never reach a request. */
  get(id: AiProviderId): BaseAiProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new AiError(
        id,
        "invalid_request",
        `no AI provider is registered for ${id}`,
      );
    }
    return provider;
  }

  all(): BaseAiProvider[] {
    return PROVIDER_IDS.flatMap((id) => {
      const provider = this.providers.get(id);
      return provider ? [provider] : [];
    });
  }

  /**
   * The provider that will serve the next request.
   *
   * **The local runtime is preferred, but only while it can actually answer.**
   * It reports itself configured unconditionally — a loopback address is always
   * meaningful and there is no key to be missing — so treating "configured" as
   * sufficient would make it win forever and no cloud key could ever be reached.
   * That is exactly what it did until this was caught. Preference therefore
   * falls through to the first configured *cloud* provider the moment local has
   * nothing loaded.
   *
   * The probe costs nothing in practice: {@link BaseAiProvider.probe} caches for
   * a minute while the runtime is up and for ten seconds while it is down, and a
   * pinned local model skips the probe entirely on the completion path.
   *
   * `AI_PROVIDER` overrides all of it, for the user who wants a cloud key even
   * with a local model loaded.
   */
  async active(): Promise<BaseAiProvider> {
    const pinned = this.pinnedProvider();
    if (pinned) return pinned;

    const local = this.get("local");
    if ((await local.probe()).online) return local;

    const cloud = this.all().find(
      (provider) => provider.id !== "local" && provider.configured,
    );
    // Nothing configured anywhere. Local is still the right answer: the caller
    // gets a clear "runtime is not configured" error naming the local provider
    // rather than a generic one.
    return cloud ?? local;
  }

  private pinnedProvider(): BaseAiProvider | null {
    const wanted = (env.AI_PROVIDER ?? "").trim();
    if (!wanted) return null;
    const provider = this.providers.get(wanted as AiProviderId);
    if (!provider?.configured) {
      throw new AiError(
        wanted as AiProviderId,
        "invalid_request",
        this.providers.has(wanted as AiProviderId)
          ? `${wanted} is pinned by AI_PROVIDER but has no API key configured`
          : `AI_PROVIDER=${wanted} is not a known provider; expected one of ${PROVIDER_IDS.join(", ")}`,
      );
    }
    return provider;
  }

  /**
   * Every provider's reachability, probed concurrently.
   *
   * This is what lets the status line show that a local model is running *and*
   * that a cloud key is available, instead of quietly switching to the cloud
   * because of a transient local hiccup.
   */
  async statuses(): Promise<AiStatus[]> {
    return Promise.all(this.all().map((provider) => provider.probe()));
  }

  /** True when at least one runtime could plausibly answer. */
  async anyOnline(): Promise<boolean> {
    const statuses = await this.statuses();
    return statuses.some((status) => status.online);
  }
}

let instance: Registry | null = null;

export function aiRegistry(): Registry {
  instance ??= new Registry();
  return instance;
}
