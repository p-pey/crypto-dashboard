import type { StatusVerdict } from "~/services/statuses/statuses.types";

/**
 * Badge colours for the cached status verdict.
 *
 * Theme independent, so they live outside the dictionary: these are meant to read
 * the same way in light, dark and glass, and a CSS variable would shift with the
 * background.
 */
export const VERDICT_COLOR: Record<StatusVerdict, string> = {
  strong_buy: "#00b894",
  buy: "#7bed9f",
  neutral: "#95a5a6",
  reduce: "#fdcb6e",
  avoid: "#d63031",
};
