import type { AppTheme } from "~/types/types";

export const Themes = {
  dark: "dark",
  light: "light",
} as const;

/** The app boots into the light "Pearl" palette; `src/proxy.ts` seeds the cookie. */
export const DEFAULT_APP_THEME: AppTheme = Themes.light;
