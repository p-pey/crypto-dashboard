"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  NAV_ITEMS,
  navKeyForPathname,
  navPathname,
} from "~/constants/navigation";
import { formatTime } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type { AppTheme } from "~/types/types";
import AlertBell from "~/components/alerts/AlertBell";
import LanguageSwitcher from "./language-switcher";
import ThemeToggle from "./theme-toggle";

export default function AppHeader({ theme }: { theme: AppTheme }) {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () =>
      setNow(
        formatTime(locale, Date.now(), { withSeconds: true, timeZone: "UTC" }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [locale]);

  const activeItem = NAV_ITEMS.find(
    (item) => item.key === navKeyForPathname(navPathname(pathname)),
  );

  const title = activeItem ? t(`nav.${activeItem.key}.label`) : t("brand.name");

  return (
    <header className="glass relative z-20 flex items-center gap-3 rounded-[18px] px-4 py-2.5 sm:gap-4 sm:px-5">
      <div className="via-brand/50 pointer-events-none absolute inset-x-6 -top-px h-px bg-gradient-to-r from-transparent to-transparent" />

      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${locale}:${pathname}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="text-fg truncate text-[17px] leading-tight font-bold tracking-tight">
              {title}
            </h1>
            <p className="text-fg-3 truncate text-[11.5px]">
              {activeItem
                ? t(`nav.${activeItem.key}.hint`)
                : t("header.realtime")}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <LanguageSwitcher />

      <div
        title={t("header.clockLabel")}
        className="border-line bg-surface-2/60 hidden items-center gap-2 rounded-full border px-3 py-1.5 md:flex"
      >
        <span className="relative flex size-2">
          <span className="bg-mint absolute inline-flex size-full animate-ping rounded-full opacity-70" />
          <span className="bg-mint relative inline-flex size-2 rounded-full" />
        </span>
        <span
          dir="ltr"
          className="num text-fg-2 text-[12px] font-semibold tabular-nums"
        >
          {now}
        </span>
        <span className="text-fg-3 text-[10px] font-medium tracking-wider">
          {t("header.utc")}
        </span>
      </div>

      <ThemeToggle theme={theme} />
      <AlertBell />
    </header>
  );
}
