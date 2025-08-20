import type { AppTheme } from "~/types/types";


export const Themes = {
       dark: "dark",
       light: "light"
} as const;
export const DEFAULT_APP_THEME: AppTheme = Themes.light;
