import type { Tone } from "./tone";
import { TONE_COLOR } from "./tone";

/**
 * The uppercase tracked label that titles every block in the app.
 *
 * Nine copies of this lived in feature files with three different letter
 * spacings, which is why panels did not line up with each other.
 */
export function Label({
  children,
  tone = "muted",
  className = "",
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`text-[10px] font-bold tracking-[0.12em] uppercase ${className}`}
      style={{ color: TONE_COLOR[tone] }}
    >
      {children}
    </span>
  );
}

/**
 * A label above a value. The atom every figure in the app is built from.
 *
 * Three presentations, because the app genuinely uses all three and forcing one
 * onto the others is what made it inconsistent:
 *
 * - `tile` — bordered, for a page's headline figures
 * - `bare` — no chrome, for a dense group of related numbers
 * - `inline` — label beside the value, for one-line rows
 *
 * `tone` defaults to muted for the label and the surface colour for the value,
 * which is right for a neutral figure and is the only sensible default for one
 * whose tone is not known until it is measured.
 */
export function Stat({
  label,
  value,
  hint,
  hintValue,
  hintTone,
  tone,
  variant = "tile",
  meter,
  size = "md",
}: {
  label: string;
  /** Pre-formatted by the caller's locale helper. Never a raw number. */
  value: string;
  /** A short trailing note: units, a comparison, a caveat. */
  hint?: string;
  /**
   * A figure printed before the hint and coloured by sign.
   *
   * The commonest shape in this app is a level plus its change — "24h volume
   * $12.4B +8%" — and it was the reason a second, near-identical `Stat` existed
   * in the coin detail panel. `null` prints the hint alone, uncoloured.
   */
  hintValue?: string;
  hintTone?: Tone | null;
  tone?: Tone;
  variant?: "tile" | "bare" | "inline";
  /** A `0..1` or `-1..1` fraction rendered as a bar under the value. */
  meter?: number;
  size?: "sm" | "md" | "lg";
}) {
  if (variant === "inline") {
    return (
      <div className="flex min-w-0 flex-col">
        <Label tone={tone ?? "muted"}>{label}</Label>
        <span
          className="num truncate text-[12.5px] font-bold tabular-nums"
          style={{ color: tone ? TONE_COLOR[tone] : "var(--fg)" }}
        >
          {value}
        </span>
        <HintLine
          hint={hint}
          hintValue={hintValue}
          hintTone={hintTone}
          inline
        />
      </div>
    );
  }

  if (variant === "bare") {
    return (
      <div className="flex min-w-0 flex-col">
        <Label tone={tone ?? "muted"}>{label}</Label>
        <span
          className={`num truncate font-bold tabular-nums ${VALUE_SIZE[size]}`}
          style={{ color: tone ? TONE_COLOR[tone] : "var(--fg)" }}
        >
          {value}
        </span>
        <HintLine
          hint={hint}
          hintValue={hintValue}
          hintTone={hintTone}
          inline
        />
        {meter !== undefined && (
          <div className="mt-1.5">
            <Bar fraction={meter} tone={tone ?? "neutral"} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-line bg-surface-2/50 rounded-[14px] border px-3.5 py-2.5">
      <Label tone={tone ?? "muted"}>{label}</Label>
      <p
        dir="ltr"
        className={`num mt-1 truncate leading-tight font-extrabold tabular-nums ${VALUE_SIZE[size]}`}
        style={{ color: tone ? TONE_COLOR[tone] : "var(--fg)" }}
      >
        {value}
      </p>
      <HintLine hint={hint} hintValue={hintValue} hintTone={hintTone} />
      {meter !== undefined && (
        <div className="mt-2">
          <Bar fraction={meter} tone={tone ?? "neutral"} />
        </div>
      )}
    </div>
  );
}

/** The trailing note, with an optional signed figure in front of it. */
function HintLine({
  hint,
  hintValue,
  hintTone,
  inline = false,
}: {
  hint?: string;
  hintValue?: string;
  hintTone?: Tone | null;
  inline?: boolean;
}) {
  if (!hint && !hintValue) return null;
  const Tag = inline ? "span" : "p";
  return (
    <Tag className={`text-fg-3 truncate text-[10px] ${inline ? "" : "mt-1"}`}>
      {hintValue !== undefined && hintValue !== null && (
        <span style={{ color: TONE_COLOR[hintTone ?? "muted"] }}>
          {hintValue}{" "}
        </span>
      )}
      {hint}
    </Tag>
  );
}

const VALUE_SIZE = {
  sm: "text-[13px]",
  md: "text-[15px]",
  lg: "text-[19px]",
} as const;

/** A 0..1 (or -1..1) fraction as a thin bar, used inside a `Stat`. */
function Bar({ fraction, tone }: { fraction: number; tone: Tone }) {
  const width = Math.max(0, Math.min(100, Math.abs(fraction) * 100));
  return (
    <div className="bg-surface-3 h-1.5 w-full overflow-hidden rounded-full">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${width}%`, background: TONE_COLOR[tone] }}
      />
    </div>
  );
}

/**
 * The responsive grid every group of stats sits in.
 *
 * Exists so that a page's figure grid is a single decision rather than a
 * hand-tuned `grid-cols-*` per panel, which is what made panels of different
 * pages line up differently.
 */
export function StatGrid({
  children,
  min = 150,
  className = "",
}: {
  children: React.ReactNode;
  /** Minimum column width before the grid wraps. */
  min?: number;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-2.5 ${className}`}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}
    >
      {children}
    </div>
  );
}
