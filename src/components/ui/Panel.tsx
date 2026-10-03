import { Label } from "./Stat";
import type { Tone } from "./tone";
import { TONE_COLOR } from "./tone";

/**
 * The page's standard surface.
 *
 * `.panel` is a CSS class, but the *composition* around it — title row, action
 * slot, hint line, consistent padding — was re-derived in every feature. This is
 * that composition, once.
 *
 * The `as` prop exists because the visual treatment is shared by a full-width
 * section and an inline card, and forcing one to be a `<section>` would produce
 * invalid nesting inside a grid row.
 */
export default function Panel({
  title,
  hint,
  action,
  tone,
  children,
  as: Tag = "section",
  padded = true,
  className = "",
}: {
  title?: string;
  hint?: string;
  /** Controls in the title row: buttons, links, a timestamp. */
  action?: React.ReactNode;
  tone?: Tone;
  children: React.ReactNode;
  as?: "section" | "div" | "article";
  padded?: boolean;
  className?: string;
}) {
  // `??` would render an empty header row for an empty string, so presence is
  // tested explicitly rather than with a falsy check that lint would rewrite.
  const hasHeader = [title, action, hint].some((part) =>
    typeof part === "string" ? part.trim() !== "" : Boolean(part),
  );

  return (
    <Tag className={`panel ${className}`}>
      {hasHeader && (
        <header
          className={`flex flex-wrap items-start justify-between gap-3 ${
            padded ? "px-5 pt-5" : "pt-5"
          }`}
        >
          <div className="min-w-0">
            {title && (
              <h3
                className="text-[13px] font-bold tracking-tight"
                style={{ color: tone ? TONE_COLOR[tone] : "var(--fg)" }}
              >
                {title}
              </h3>
            )}
            {hint && (
              <p className="text-fg-3 mt-0.5 max-w-2xl text-[11px] leading-relaxed">
                {hint}
              </p>
            )}
          </div>
          {action && (
            <div className="flex flex-wrap items-center gap-2">{action}</div>
          )}
        </header>
      )}
      <div className={padded ? "px-5 py-5" : "py-5"}>{children}</div>
    </Tag>
  );
}

/**
 * A titled group of related figures inside a panel.
 *
 * The borderless inner box used by nearly every detail view. Made a component
 * because it was copied six times with slightly different padding.
 */
export function PanelSection({
  title,
  hint,
  columns = 2,
  children,
}: {
  title: string;
  hint?: string;
  columns?: 1 | 2 | 3 | 4;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{title}</Label>
        {hint && <span className="text-fg-3 text-[10px]">{hint}</span>}
      </div>
      <div
        className={`grid gap-x-4 gap-y-2.5 ${
          columns === 1
            ? "grid-cols-1"
            : columns === 2
              ? "grid-cols-2"
              : columns === 3
                ? "grid-cols-2 sm:grid-cols-3"
                : "grid-cols-2 sm:grid-cols-4"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** A bordered inner box, for a sub-panel that needs its own edge. */
export function PanelBox({
  title,
  hint,
  children,
  className = "",
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const hasSubheader = [title, hint].some(
    (part) => typeof part === "string" && part.trim() !== "",
  );

  return (
    <div
      className={`border-line bg-surface-2/40 flex flex-col rounded-[14px] border px-4 py-3.5 ${className}`}
    >
      {hasSubheader && (
        <div className="mb-2.5">
          {title && <Label>{title}</Label>}
          {hint && (
            <p className="text-fg-3 mt-0.5 text-[10px] leading-relaxed">
              {hint}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * A small labelled chip.
 *
 * Replaces the ad-hoc inline `rounded-full px-2` spans that had four different
 * padding values across the app.
 */
export function Pill({
  children,
  tone = "neutral",
  size = "md",
  title,
}: {
  children: React.ReactNode;
  tone?: Tone;
  size?: "sm" | "md";
  title?: string;
}) {
  const color = TONE_COLOR[tone];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full font-bold whitespace-nowrap ${
        size === "sm"
          ? "px-1.5 py-[1px] text-[9.5px]"
          : "px-2 py-[2px] text-[10.5px]"
      }`}
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

/** A dot in a tone, for status rows where a chip would be too heavy. */
export function Dot({ tone, title }: { tone: Tone; title?: string }) {
  return (
    <span
      title={title}
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ background: TONE_COLOR[tone] }}
    />
  );
}
