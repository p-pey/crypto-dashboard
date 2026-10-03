import { setThemeCookie } from "~/app/actions";
import { Themes, THEME_ORDER } from "~/constants/constants";
import { useI18n } from "~/i18n/I18nProvider";
import type { AppTheme } from "~/types/types";

/**
 * One glyph per theme, drawn in the accent colour that theme is known by.
 *
 * Keying the icon on the target rather than stacking three spans keeps the
 * markup to a single child, and remounting it on every change is what drives
 * the little entrance animation.
 */
const ICONS: Record<AppTheme, { path: string; color: string }> = {
  light: {
    path: "M12 4V2M12 22v-2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    color: "text-amber",
  },
  dark: {
    path: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
    color: "text-brand-2",
  },
  mixer: {
    // A broadcast aperture over a horizon line. Mixer's own mark was a
    // segmented lens, which reads at 16px where a waveform does not.
    path: "M12 3.2a8.8 8.8 0 1 1 0 17.6 8.8 8.8 0 0 1 0-17.6Zm0 3.6a5.2 5.2 0 1 0 0 10.4 5.2 5.2 0 0 0 0-10.4ZM12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2",
    color: "text-brand-2",
  },
  glass: {
    // A droplet over a curved baseline: liquid glass without pretending to be
    // a literal material.
    path: "M12 3c3.2 3.4 5.5 6.3 5.5 9.2A5.5 5.5 0 0 1 6.5 12.2C6.5 9.3 8.8 6.4 12 3ZM3.5 20.5c2.6-1.3 5.2-1.3 8.5 0s5.9 1.3 8.5 0",
    color: "text-cyan",
  },
};

/** The themes a visitor cycles through, in order. */
function nextTheme(theme: AppTheme): AppTheme {
  const index = THEME_ORDER.indexOf(theme);
  // An unrecognised cookie value should still land on a real theme.
  if (index === -1) return Themes.light;
  return THEME_ORDER[(index + 1) % THEME_ORDER.length] ?? Themes.light;
}

/**
 * Client theme switcher. The active theme is stored in a cookie that the root
 * layout reads server-side, so switching needs a server round trip plus a reload
 * to re-render with the new antd algorithm.
 *
 * The class on <html> is flipped optimistically so the CSS custom properties
 * (aurora, panels, Tailwind `dark:` variants) switch instantly, without waiting
 * for the RSC payload.
 *
 * This cycles light → dark → glass rather than toggling between two, because
 * three themes are no longer a pair. The glyph shown is always the theme you
 * would land on, and its position in the cycle is what the loading spinner
 * beside it reflects.
 */
export default function ThemeToggle({
  theme,
  showLabel = false,
}: {
  theme: AppTheme;
  showLabel?: boolean;
}) {
  const { t } = useI18n();
  const next = nextTheme(theme);
  const icon = ICONS[next];

  const nextLabel =
    next === Themes.dark
      ? t("common.dark")
      : next === Themes.glass
        ? t("common.glass")
        : t("common.light");
  const label = t("common.switchTo", nextLabel);

  async function toggle() {
    document.documentElement.classList.toggle("dark", next === Themes.dark);
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.style.colorScheme =
      next === Themes.light ? "light" : "dark";
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    await setThemeCookie(next);
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="group border-line bg-surface-2/70 text-fg-2 hover:border-brand/50 hover:text-fg relative flex h-10 items-center gap-2.5 overflow-hidden rounded-full border px-3 backdrop-blur-md transition-all duration-300 active:scale-95"
    >
      <span className="via-brand/15 pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent to-transparent transition-transform duration-700 group-hover:translate-x-full" />

      <span className="relative grid size-6 place-items-center">
        {/* Re-keyed on the target so the next glyph animates in rather than the
            previous one animating out. */}
        <svg
          key={next}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={`${icon.color} size-[18px] motion-safe:animate-[fade-up_0.45s_var(--ease-out-expo)_both]`}
        >
          {next === Themes.light && (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d={icon.path} />
            </>
          )}
          {next !== Themes.light && <path d={icon.path} />}
        </svg>
      </span>

      {showLabel && (
        <span className="relative text-xs font-semibold tracking-wide">
          {nextLabel}
        </span>
      )}
    </button>
  );
}
