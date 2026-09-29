"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { api } from "~/trpc/react";
import type { Coin } from "~/types/types";

export default function PriceTicker() {
  const { data } = api.overview.getPrices.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: 60_000,
  });

  const items: Coin[] = data ?? [];

  return (
    <div className="glass relative flex h-[42px] items-center overflow-hidden rounded-[16px]">
      <div className="border-line/70 from-brand/20 z-10 flex h-full shrink-0 items-center gap-2 border-r bg-gradient-to-r to-transparent px-3.5">
        <span className="bg-brand-2 size-1.5 rounded-full shadow-[0_0_10px_var(--brand-2)]" />
        <span className="text-fg-2 text-[10px] font-bold tracking-[0.14em] uppercase">
          24h
        </span>
      </div>

      <div className="group relative min-w-0 flex-1 overflow-hidden">
        {items.length === 0 ? (
          <div className="flex h-full items-center gap-3 px-4">
            {Array.from({ length: 9 }, (_, i) => (
              <div
                key={i}
                className="bg-surface-3 h-2.5 w-16 animate-pulse rounded-full"
              />
            ))}
          </div>
        ) : (
          <div className="animate-marquee flex w-max group-hover:[animation-play-state:paused]">
            {[0, 1].map((dup) => (
              <div
                key={dup}
                className="flex shrink-0 items-center"
                aria-hidden={dup === 1}
              >
                {items.map((coin) => {
                  const up = coin.price_change_percentage_24h >= 0;
                  return (
                    <Link
                      key={`${dup}-${coin.symbol}`}
                      href="/"
                      className="num hover:bg-surface-2 flex items-center gap-1.5 px-3.5 py-1 text-[12px] whitespace-nowrap transition-colors"
                    >
                      <span className="text-fg-2 font-semibold">
                        {coin.symbol.toUpperCase()}
                      </span>
                      <span
                        className="font-bold tabular-nums"
                        style={{ color: up ? "var(--up)" : "var(--down)" }}
                      >
                        {up ? "+" : ""}
                        {coin.price_change_percentage_24h.toFixed(2)}%
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={up ? "var(--up)" : "var(--down)"}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`size-3 ${up ? "" : "rotate-180"}`}
                      >
                        <path d="M7 14l5-5 5 5" />
                      </svg>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div className="from-surface pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r to-transparent" />
        <div className="from-surface pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l to-transparent" />
      </div>

      <motion.div
        className="border-line/70 z-10 hidden h-full shrink-0 items-center border-l px-3.5 md:flex"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <span className="text-fg-3 text-[10px] font-medium tracking-wider uppercase">
          Obsidian Terminal
        </span>
      </motion.div>
    </div>
  );
}
