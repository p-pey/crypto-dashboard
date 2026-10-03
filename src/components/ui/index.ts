export { default as Meter } from "./Meter";
export { Label, Stat, StatGrid } from "./Stat";
export { default as Panel, Dot, PanelBox, PanelSection, Pill } from "./Panel";
export { TONE_COLOR, toneColor, toneForSign } from "./tone";
export type { Tone } from "./tone";

/**
 * The design system's entry point.
 *
 * Feature code imports from `@/components/ui` and nothing else in this folder,
 * so the surface stays small enough to hold in your head. Everything exported
 * here is theme-agnostic: colour comes from a {@link Tone}, never a hex value.
 */
