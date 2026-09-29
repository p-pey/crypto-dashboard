/**
 * Locale registry.
 *
 * This module is imported by `src/proxy.ts`, which runs on the edge before any
 * route is rendered, so it must stay dependency free — no `server-only`, no
 * dictionaries, no node builtins.
 */

export const LOCALES = ["fa", "en", "de"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fa";

export type LocaleMeta = {
  /** BCP-47 tag handed to `Intl` and written to `<html lang>`. */
  htmlLang: string;
  dir: "ltr" | "rtl";
  /** Endonym shown in the language switcher. */
  label: string;
  /** Latin transliteration, used as the secondary line in the switcher. */
  englishName: string;
  /** Flag-free two letter badge. */
  badge: string;
  /** `Intl` locale used for numbers, dates and relative times. */
  intl: string;
};

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  fa: {
    htmlLang: "fa-IR",
    dir: "rtl",
    label: "فارسی",
    englishName: "Persian",
    badge: "فا",
    intl: "fa-IR",
  },
  en: {
    htmlLang: "en",
    dir: "ltr",
    label: "English",
    englishName: "English",
    badge: "EN",
    intl: "en-US",
  },
  de: {
    htmlLang: "de",
    dir: "ltr",
    label: "Deutsch",
    englishName: "German",
    badge: "DE",
    intl: "de-DE",
  },
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

const BASE_LOCALE: Record<Locale, string> = {
  fa: "fa",
  en: "en",
  de: "de",
};

/**
 * Best-effort negotiation for a request that arrived without a locale prefix.
 * Order of preference: an explicit cookie choice, then the `Accept-Language`
 * header, then {@link DEFAULT_LOCALE}. Written by hand so the edge runtime never
 * has to load a negotiation library.
 */
export function negotiateLocale(
  acceptLanguage: string | null,
  preferred: string | null,
): Locale {
  if (preferred && isLocale(preferred)) return preferred;

  if (acceptLanguage) {
    const ranked = acceptLanguage
      .split(",")
      .map((part) => {
        const [tag = "", ...params] = part.trim().split(";");
        const q = params
          .map((p) => p.trim())
          .find((p) => p.startsWith("q="))
          ?.slice(2);
        return { tag: tag.trim().toLowerCase(), q: q ? Number(q) : 1 };
      })
      .filter((entry) => entry.tag.length > 0 && !Number.isNaN(entry.q))
      .sort((a, b) => b.q - a.q);

    for (const { tag } of ranked) {
      // `fa-IR` should still resolve to `fa`, and `*` means "anything".
      const primary = tag.split("-")[0] ?? "";
      const match = LOCALES.find(
        (locale) => BASE_LOCALE[locale] === primary || tag === locale,
      );
      if (match) return match;
    }
  }

  return DEFAULT_LOCALE;
}

/** Strips a leading `/<locale>` segment, returning the locale-free pathname. */
export function stripLocale(pathname: string): string {
  const [, first, ...rest] = pathname.split("/");
  if (first && isLocale(first)) {
    const remaining = rest.join("/");
    return remaining ? `/${remaining}` : "/";
  }
  return pathname;
}

/** Prefixes a locale-free pathname with the given locale. */
export function withLocale(locale: Locale, pathname: string): string {
  const clean = pathname === "/" ? "" : pathname;
  return `/${locale}${clean}`;
}
