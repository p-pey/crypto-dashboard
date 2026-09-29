"use server";

import { cookies } from "next/headers";
import { Themes } from "~/constants/constants";
import type { AppTheme } from "~/types/types";

/** Persist the selected theme so the root layout can render it server-side. */
export async function setThemeCookie(theme: AppTheme) {
  const store = await cookies();
  store.set("theme", theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

export async function getThemeCookie(): Promise<AppTheme> {
  const store = await cookies();
  return (store.get("theme")?.value as AppTheme | null) ?? Themes.dark;
}
