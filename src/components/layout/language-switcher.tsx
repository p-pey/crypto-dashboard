"use client";

import { Languages } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleCookie } from "~/app/actions";
import { LOCALES, LOCALE_META, stripLocale, type Locale } from "~/i18n/config";
import { useI18n } from "~/i18n/I18nProvider";

/**
 * Switching language keeps the visitor on the same page, only re-prefixed. The
 * choice is written to the same cookie `src/proxy.ts` reads so a later visit
 * to the bare root comes back in their own language instead of whatever
 * `Accept-Language` happens to say.
 */
export default function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const current = stripLocale(pathname);

  function pick(next: Locale) {
    if (next === locale) return;

    startTransition(async () => {
      await setLocaleCookie(next);
      router.push(`/${next}${current === "/" ? "" : current}`);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t("common.language")}
      className={`border-line bg-surface-2/70 flex items-center gap-1 rounded-full border p-1 backdrop-blur-md transition-opacity ${
        pending ? "opacity-60" : "opacity-100"
      }`}
    >
      <Languages
        aria-hidden
        className="text-fg-3 ms-2 me-0.5 size-[15px] shrink-0"
        strokeWidth={2.1}
      />

      {LOCALES.map((candidate) => {
        const active = candidate === locale;
        const meta = LOCALE_META[candidate];

        return (
          <button
            key={candidate}
            type="button"
            onClick={() => pick(candidate)}
            aria-current={active ? "true" : undefined}
            title={meta.englishName}
            className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold transition-all duration-300 ${
              active
                ? "from-brand to-brand-2 bg-gradient-to-br text-white shadow-[0_4px_12px_-6px_var(--glow-1)]"
                : "text-fg-3 hover:bg-surface-3 hover:text-fg"
            }`}
          >
            {meta.badge}
          </button>
        );
      })}
    </div>
  );
}
