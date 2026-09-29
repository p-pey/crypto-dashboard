import "server-only";

import { isLocale, type Locale } from "../config";
import type { Dictionary } from "./types";

/**
 * Dictionaries are plain objects loaded through a switch so the bundler can
 * code split them per locale instead of shipping all three to the client.
 * They are also passed to Client Components through `I18nProvider`, which is
 * the only place that serialises them into the RSC payload.
 */

type Loader = () => Promise<Dictionary>;

const loaders: Record<Locale, Loader> = {
  en: () => import("./en").then((m) => m.default),
  fa: () => import("./fa").then((m) => m.default),
  de: () => import("./de").then((m) => m.default),
};

const cache = new Map<Locale, Dictionary>();

export async function getDictionary(locale: string): Promise<Dictionary> {
  const resolved: Locale = isLocale(locale) ? locale : "fa";

  const cached = cache.get(resolved);
  if (cached) return cached;

  const dictionary = await loaders[resolved]();
  cache.set(resolved, dictionary);
  return dictionary;
}

export type { Dictionary };
export type {
  Horizon,
  InstrumentKey,
  MacroAsset,
  NavKey,
  VerdictKey,
} from "./types";
