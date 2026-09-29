"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  NAV_ITEMS,
  navHref,
  navKeyForPathname,
  navPathname,
} from "~/constants/navigation";
import { useI18n } from "~/i18n/I18nProvider";

const spring = { type: "spring", stiffness: 380, damping: 32 } as const;

export default function AppSidebar() {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const current = navPathname(pathname);
  const activeKey = navKeyForPathname(current);

  return (
    <div className="glass relative flex h-full flex-col overflow-hidden rounded-[22px]">
      <span aria-hidden className="halo absolute inset-x-0 top-0 h-px" />

      {/* Top accent bar */}
      <div className="via-brand/60 pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent" />

      <Link
        href={navHref(locale, "/")}
        className="group relative flex items-center gap-3 px-5 py-[18px]"
      >
        <motion.span
          whileHover={{ rotate: 180 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
          className="from-brand via-brand-2 to-cyan relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-[11px] bg-gradient-to-br shadow-[0_8px_24px_-8px_var(--glow-1)]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-[19px]"
          >
            <path d="M3 17l5-6 4 4 4-6 5 5" />
          </svg>
          <span className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        </motion.span>

        <span className="min-w-0">
          <span className="text-gradient block truncate text-[15px] leading-tight font-bold tracking-tight">
            {t("brand.name")}
          </span>
          <span className="text-fg-3 block truncate text-[10.5px] font-medium tracking-[0.14em] uppercase">
            {t("brand.tagline")}
          </span>
        </span>
      </Link>

      <nav className="relative flex-1 px-3 pb-3">
        <p className="text-fg-3 px-3 pt-2 pb-2.5 text-[10px] font-semibold tracking-[0.16em] uppercase">
          {t("nav.section")}
        </p>

        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = item.key === activeKey;
            const Icon = item.icon;

            return (
              <li key={item.key} className="relative">
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    transition={spring}
                    className="border-brand/35 from-brand/22 via-brand/12 absolute inset-0 -z-0 rounded-[13px] border bg-gradient-to-r to-transparent shadow-[inset_0_1px_0_0_rgb(255_255_255/0.07)]"
                  />
                )}

                <Link
                  href={navHref(locale, item.href)}
                  aria-current={active ? "page" : undefined}
                  className="group relative z-10 flex items-center gap-3 rounded-[13px] px-3 py-2.5 transition-colors duration-300"
                >
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-[10px] transition-all duration-300 ${
                      active
                        ? "from-brand to-brand-2 bg-gradient-to-br text-white shadow-[0_6px_18px_-8px_var(--glow-1)]"
                        : "bg-surface-2 text-fg-2 group-hover:bg-surface-3 group-hover:text-fg"
                    }`}
                  >
                    <Icon className="size-[17px]" strokeWidth={2.1} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-[13.5px] font-semibold transition-colors duration-300 ${
                        active ? "text-fg" : "text-fg-2 group-hover:text-fg"
                      }`}
                    >
                      {t(`nav.${item.key}.label`)}
                    </span>
                    <span className="text-fg-3 block truncate text-[10.5px]">
                      {t(`nav.${item.key}.hint`)}
                    </span>
                  </span>

                  {active && (
                    <motion.span
                      initial={{ scaleX: 0, opacity: 0 }}
                      animate={{ scaleX: 1, opacity: 1 }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      className="from-brand-2 to-cyan h-5 w-[3px] shrink-0 rounded-full bg-gradient-to-b"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-line/70 relative border-t px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="from-mint/25 to-cyan/20 relative grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br">
            <span className="animate-pulse-soft border-mint/40 absolute inset-0 rounded-full border" />
            <span className="bg-mint size-1.5 rounded-full" />
          </span>
          <div className="min-w-0">
            <p className="text-fg truncate text-[11.5px] font-semibold">
              {t("common.systemsNominal")}
            </p>
            <p className="text-fg-3 truncate text-[10px]">
              {t("common.feedActive")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
