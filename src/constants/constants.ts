import type { AppTheme } from "~/types/types";

/**
 * The app's three themes.
 *
 * `glass` is a dark palette whose surfaces are translucent and blurred over the
 * aurora, so it reads as frosted glass rather than as a fourth set of greys. It
 * is deliberately not an independent scheme: it borrows the dark text ramp and
 * only changes how the surfaces are painted, which is why it needs its own
 * token block but not its own antd algorithm.
 */
export const Themes = {
  dark: "dark",
  light: "light",
  glass: "glass",
  mixer: "mixer",
} as const;

/**
 * The cycling order.
 *
 * Mixer is last on purpose: it is the most expressive theme and the least
 * legible for a dense table, so it is the one you pick for the room rather than
 * for the numbers. Everything readable comes first.
 */
export const THEME_ORDER = [
  Themes.light,
  Themes.dark,
  Themes.glass,
  Themes.mixer,
] as const;

/** The app boots into the light "Pearl" palette; `src/proxy.ts` seeds the cookie. */
export const DEFAULT_APP_THEME: AppTheme = Themes.light;

/**
 * Whether a cookie value is a theme this build knows about.
 *
 * The `theme` cookie is read straight off the request, so it can hold anything:
 * a value from an older build, or something typed by hand. Nothing downstream
 * may assume it is valid, because `COLORS[mode]` on an unknown key is
 * `undefined` and antd's token bridge would throw on the first component that
 * renders.
 */
export function isAppTheme(value: unknown): value is AppTheme {
  // `Object.hasOwn` rather than `in`: `in` walks the prototype chain, so
  // "toString" and "constructor" would pass and index straight into `COLORS`.
  return typeof value === "string" && Object.hasOwn(Themes, value);
}
