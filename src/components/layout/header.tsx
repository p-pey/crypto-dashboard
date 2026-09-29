"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_ITEMS } from "~/constants/navigation";
import type { AppTheme } from "~/types/types";
import ThemeToggle from "./theme-toggle";

const TITLES: Record<string, string> = {
  "/": "Markets",
  "/etfs": "ETF Flows",
  "/ir-price": "Iranian Exchanges",
};

export default function AppHeader({ theme }: { theme: AppTheme }) {
  const pathname = usePathname();
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZone: "UTC",
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const title = TITLES[pathname] ?? "Obsidian";
  const activeItem = NAV_ITEMS.find((i) =>
    i.href === "/" ? pathname === "/" : pathname.startsWith(i.href),
  );

  return (
    <header className="glass relative z-20 flex items-center gap-4 rounded-[18px] px-4 py-2.5 sm:px-5">
      <div className="via-brand/50 pointer-events-none absolute inset-x-6 -top-px h-px bg-gradient-to-r from-transparent to-transparent" />

      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="text-fg truncate text-[17px] leading-tight font-bold tracking-tight">
              {title}
            </h1>
            <p className="text-fg-3 truncate text-[11.5px]">
              {activeItem?.hint ?? "Realtime market data"}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="border-line bg-surface-2/60 hidden items-center gap-2 rounded-full border px-3 py-1.5 sm:flex">
        <span className="relative flex size-2">
          <span className="bg-mint absolute inline-flex size-full animate-ping rounded-full opacity-70" />
          <span className="bg-mint relative inline-flex size-2 rounded-full" />
        </span>
        <span className="num text-fg-2 text-[12px] font-semibold tabular-nums">
          {now}
        </span>
        <span className="text-fg-3 text-[10px] font-medium tracking-wider">
          UTC
        </span>
      </div>

      <ThemeToggle theme={theme} />
    </header>
  );
}
