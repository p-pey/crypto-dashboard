"use client";

import { motion } from "motion/react";
import { useState } from "react";
import type { PriceChange } from "~/services/binance/BinanceSocketService.types";
import { COLORS } from "~/styles/colors";

const EASE = [0.16, 1, 0.3, 1] as const;
const SURFACE = "var(--surface)";

function isUp(value: string): boolean {
  return !value.trim().startsWith("-");
}

function Delta({ value, subtle }: { value: string; subtle?: boolean }) {
  const up = isUp(value);
  return (
    <span
      className="num inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[12.5px] font-bold tabular-nums"
      style={{
        color: up ? COLORS.dark.up : COLORS.dark.down,
        background: up
          ? "color-mix(in srgb, var(--up) 14%, transparent)"
          : "color-mix(in srgb, var(--down) 14%, transparent)",
        opacity: subtle ? 0.9 : 1,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`size-[11px] ${up ? "" : "rotate-180"}`}
      >
        <path d="M7 14l5-5 5 5" />
      </svg>
      {value}
    </span>
  );
}

export default function CoinsTable({
  rows,
  loading,
}: {
  rows: PriceChange[];
  loading: boolean;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="panel overflow-hidden"
    >
      <div className="border-line/70 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-fg text-[15px] font-bold tracking-tight">
            Spot markets
          </h2>
          <p className="text-fg-3 text-[12px]">
            Live Binance ticker · updates in place
          </p>
        </div>

        <div className="border-line bg-surface-2/70 flex items-center gap-2 rounded-full border px-3 py-1.5">
          <span className="relative flex size-1.5">
            <span className="bg-mint absolute inline-flex size-full animate-ping rounded-full opacity-70" />
            <span className="bg-mint relative inline-flex size-1.5 rounded-full" />
          </span>
          <span className="text-fg-2 text-[11px] font-semibold">
            {loading ? "Syncing" : `${rows.length} pairs`}
          </span>
        </div>
      </div>

      <div className="max-h-[calc(100dvh-260px)] overflow-y-auto">
        <table className="w-full border-collapse text-left">
          <thead className="bg-surface-2/95 sticky top-0 z-10 backdrop-blur-sm">
            <tr className="text-fg-3 text-[10.5px] font-bold tracking-[0.12em] uppercase">
              <th className="w-14 px-5 py-3 font-bold">#</th>
              <th className="px-3 py-3 font-bold">Asset</th>
              <th className="px-3 py-3 text-right font-bold">Price (USDT)</th>
              <th className="px-3 py-3 text-right font-bold">Δ USD 24h</th>
              <th className="px-5 py-3 text-right font-bold">Δ % 24h</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => {
              const up = isUp(row.change);
              const isHot = hovered === row.symbol;

              return (
                <motion.tr
                  key={row.symbol}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: Math.min(index * 0.018, 0.5),
                    ease: EASE,
                  }}
                  onMouseEnter={() => setHovered(row.symbol)}
                  onMouseLeave={() => setHovered(null)}
                  className="group border-line/50 hover:bg-surface-2 cursor-default border-t transition-colors duration-200"
                  style={{
                    background: isHot
                      ? "color-mix(in srgb, var(--surface-2) 70%, transparent)"
                      : undefined,
                  }}
                >
                  <td className="relative px-5 py-3">
                    <span
                      className={`absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-gradient-to-b transition-opacity duration-300 ${
                        up ? "from-mint to-cyan" : "from-rose to-amber"
                      } ${isHot ? "opacity-100" : "opacity-0"}`}
                    />
                    <span
                      className={`num inline-grid size-6 place-items-center rounded-lg text-[11.5px] font-bold transition-colors duration-300 ${
                        index < 3
                          ? "from-brand to-brand-2 bg-gradient-to-br text-white shadow-[0_4px_12px_-6px_var(--glow-1)]"
                          : "bg-surface-3 text-fg-3"
                      }`}
                    >
                      {row.order}
                    </span>
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="ring-gradient grid size-9 shrink-0 place-items-center overflow-hidden rounded-full transition-transform duration-500 group-hover:scale-110"
                        style={{ background: SURFACE }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={row.image}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="size-full object-cover"
                        />
                      </span>
                      <div className="min-w-0">
                        <p className="text-fg truncate text-[13.5px] font-semibold">
                          {row.symbol}
                        </p>
                        <p className="text-fg-3 truncate text-[11px]">
                          {row.symbol}/BTC
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="num text-fg px-3 py-3 text-right text-[13.5px] font-semibold tabular-nums">
                    {row.price}
                  </td>

                  <td className="px-3 py-3 text-right">
                    <span
                      className="num text-[13px] font-medium tabular-nums"
                      style={{ color: up ? "var(--up)" : "var(--down)" }}
                    >
                      {row.changeUsd}
                    </span>
                  </td>

                  <td className="px-5 py-3 text-right">
                    <Delta value={row.change} />
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="grid place-items-center gap-2 px-6 py-16">
            <div className="border-line border-t-brand size-8 animate-spin rounded-full border-2" />
            <p className="text-fg-3 text-[13px]">Waiting for the first tick…</p>
          </div>
        )}
      </div>
    </motion.section>
  );
}
