import { setThemeCookie } from "~/app/actions";
import { Themes } from "~/constants/constants";
import type { AppTheme } from "~/types/types";

/**
 * Client theme switcher. The active theme is stored in a cookie that the root
 * layout reads server-side, so switching needs a server round trip plus a
 * `router.refresh()` to re-render with the new antd algorithm.
 *
 * The `.dark` class on <html> is flipped optimistically so the CSS custom
 * properties (aurora, panels, Tailwind `dark:` variants) switch instantly
 * without waiting for the RSC payload.
 */
export default function ThemeToggle({
  theme,
  showLabel = false,
}: {
  theme: AppTheme;
  showLabel?: boolean;
}) {
  const next = theme === Themes.dark ? Themes.light : Themes.dark;

  async function toggle() {
    document.documentElement.classList.toggle("dark", next === Themes.dark);
    document.documentElement.style.colorScheme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    await setThemeCookie(next);
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="group border-line bg-surface-2/70 text-fg-2 hover:border-brand/50 hover:text-fg relative flex h-10 items-center gap-2.5 overflow-hidden rounded-full border px-3 backdrop-blur-md transition-all duration-300 active:scale-95"
    >
      <span className="via-brand/15 pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent to-transparent transition-transform duration-700 group-hover:translate-x-full" />

      <span className="relative grid size-6 place-items-center">
        <span
          className={`absolute transition-all duration-500 ${
            theme === Themes.light
              ? "scale-100 rotate-0 opacity-100"
              : "scale-0 rotate-90 opacity-0"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-amber size-[18px]"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        </span>
        <span
          className={`absolute transition-all duration-500 ${
            theme === Themes.dark
              ? "scale-100 rotate-0 opacity-100"
              : "scale-0 -rotate-90 opacity-0"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-brand-2 size-[18px]"
          >
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
          </svg>
        </span>
      </span>

      {showLabel && (
        <span className="relative text-xs font-semibold tracking-wide capitalize">
          {theme}
        </span>
      )}
    </button>
  );
}
