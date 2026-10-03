/**
 * The vocabulary the design system speaks.
 *
 * Every primitive takes a `tone` from here rather than a raw colour string.
 * That is what makes theming work: a component hard-coded to `var(--rose)` stops
 * responding the moment a theme changes its ramp, whereas a tone resolves through
 * the same token table in every theme.
 *
 * Adding a tone means adding it to {@link TONE_COLOR} and to `colors.ts` if it
 * needs a distinct antd mapping. Nothing else changes.
 */
export type Tone =
  /** Positive movement: value went up and that is good. */
  | "up"
  /** Negative movement: value went down and that is bad. */
  | "down"
  /** Present but deliberately unremarkable. */
  | "neutral"
  /** Faintest legible text; for chrome rather than data. */
  | "muted"
  /** The accent colour of the active theme. */
  | "brand"
  /** Warning-ish. */
  | "amber"
  /** Informational. */
  | "cyan";

export const TONE_COLOR: Record<Tone, string> = {
  up: "var(--up)",
  down: "var(--down)",
  neutral: "var(--text-2)",
  muted: "var(--text-3)",
  brand: "var(--brand-2)",
  amber: "var(--amber)",
  cyan: "var(--cyan)",
};

/**
 * Picks a tone from a signed number, with a dead zone.
 *
 * The dead zone matters: a drift of `+0.02%` is not an up move, and colouring it
 * green implies a precision the number does not carry. `threshold` is in the
 * same units as the input.
 */
export function toneForSign(
  value: number | null | undefined,
  threshold = 0,
): Tone {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "muted";
  }
  if (value > threshold) return "up";
  if (value < -threshold) return "down";
  return "neutral";
}

/** Resolves a tone to the colour it paints with. */
export function toneColor(tone: Tone): string {
  return TONE_COLOR[tone];
}
