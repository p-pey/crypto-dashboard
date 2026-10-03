import type { Tone } from "./tone";
import { TONE_COLOR } from "./tone";

/**
 * A bar that reads a signed value.
 *
 * Two modes, because two different questions get asked of a bar:
 *
 * - **diverging** (the default) draws around a centre zero, which is the only
 *   honest way to show a signed number. A bar from the left edge cannot tell a
 *   rise from a fall without the number beside it, and the number is not always
 *   there.
 * - **fill** measures magnitude against `max`, for values that cannot go
 *   negative — a coverage ratio, a share of a maximum.
 *
 * This existed as four separate implementations across the analyse feature,
 * each with its own magic numbers. One component means the dead zone, the
 * rounding and the minimum visible width are decided once.
 */
export default function Meter({
  value,
  max = 100,
  tone,
  diverging = true,
  height = 6,
  /** Width below which the bar stops shrinking, so a small value stays visible. */
  minWidth = 2,
  label,
  className = "",
}: {
  value: number | null | undefined;
  /** Scale for `fill` mode, and the rail for `diverging` mode. */
  max?: number;
  tone: Tone;
  diverging?: boolean;
  height?: number;
  minWidth?: number;
  label?: string;
  /** Spacing when the meter sits directly under text rather than in a `Stat`. */
  className?: string;
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return (
      <div
        className={`bg-surface-3 w-full rounded-full ${className}`}
        style={{ height }}
        role="meter"
        aria-label={label}
        aria-valuenow={0}
        aria-valuemin={0}
        aria-valuemax={max}
      />
    );
  }

  const color = TONE_COLOR[tone];
  const positive = value >= 0;

  if (!diverging) {
    const width = Math.max(
      0,
      Math.min(100, (Math.abs(value) / (max || 1)) * 100),
    );
    return (
      <div
        className={`bg-surface-3 w-full overflow-hidden rounded-full ${className}`}
        style={{ height }}
        role="meter"
        aria-label={label}
        aria-valuenow={Math.abs(value)}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.max(width, minWidth)}%`, background: color }}
        />
      </div>
    );
  }

  // Half the rail each side, so a value at the limit fills exactly one half.
  const rail = Math.max(1, Math.abs(value) / max) * 50;
  // Named rather than inlined as `-max` because the a11y rule cannot see
  // through a negation to know the expression is still a number.
  const lowBound = -max;

  return (
    <div
      className={`bg-surface-3 relative w-full overflow-hidden rounded-full ${className}`}
      style={{ height }}
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={lowBound}
      aria-valuemax={max}
    >
      <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--border-strong)]" />
      <span
        className="absolute inset-y-0 rounded-full transition-all duration-700"
        style={{
          width: `${Math.max(rail, minWidth)}%`,
          insetInlineStart: positive ? "50%" : undefined,
          insetInlineEnd: positive ? undefined : "50%",
          background: color,
        }}
      />
    </div>
  );
}
