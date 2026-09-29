"use server";

import { cookies } from "next/headers";
import { Themes } from "~/constants/constants";
import { DEFAULT_LOCALE, isLocale } from "~/i18n/config";
import type { AppTheme } from "~/types/types";

const THEME_COOKIE = "theme";
const LOCALE_COOKIE = "NEXT_LOCALE";

/** Persist the selected theme so the root layout can render it server-side. */
export async function setThemeCookie(theme: AppTheme) {
  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

export async function getThemeCookie(): Promise<AppTheme> {
  const store = await cookies();
  return (store.get(THEME_COOKIE)?.value as AppTheme | null) ?? Themes.light;
}

/**
 * Persist the language the visitor picked. `src/proxy.ts` reads this on a bare
 * request so the next visit skips `Accept-Language` negotiation.
 */
export async function setLocaleCookie(locale: string) {
  const store = await cookies();
  store.set(LOCALE_COOKIE, isLocale(locale) ? locale : DEFAULT_LOCALE, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

export async function getLocaleCookie(): Promise<string> {
  const store = await cookies();
  return store.get(LOCALE_COOKIE)?.value ?? DEFAULT_LOCALE;
}
