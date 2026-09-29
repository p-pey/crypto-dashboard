"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import { Sparklines, SparklinesLine } from "react-sparklines";
import type { YahooFinanceChartResponse } from "~/types/types";

const EASE = [0.16, 1, 0.3, 1] as const;

const compact = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function SparkCard({
  data,
  index,
}: {
  data: YahooFinanceChartResponse;
  index: number;
}) {
  const result = data.chart.result[0];
  if (result === undefined) {
    throw new Error("ETF chart data is missing");
  }
  const meta = result.meta;
  const prices = (result.indicators.quote[0]?.low ?? []).filter(
    (n): n is number => n !== null,
  );

  const isBullish = meta.chartPreviousClose <= meta.regularMarketDayHigh;
  const stroke = isBullish ? "var(--up)" : "var(--down)";
  const prev = meta.chartPreviousClose;
  const changePct = prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0;

  const stats = useMemo(
    () => [
      {
        label: "Day high",
        value: `$${compact.format(meta.regularMarketDayHigh)}`,
      },
      {
        label: "Day low",
        value: `$${compact.format(meta.regularMarketDayLow)}`,
      },
      { label: "Volume", value: compact.format(meta.regularMarketVolume) },
    ],
    [meta],
  );

  return (
    <motion.article
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.55,
        delay: index * 0.07,
        ease: EASE,
      }}
      whileHover={{ y: -6 }}
      className="panel panel-hover group relative flex h-full flex-col overflow-hidden p-5"
    >
      {/* Bullish / bearish corner wash */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-14 size-40 rounded-full blur-3xl transition-opacity duration-500"
        style={{
          background: isBullish ? "var(--glow-2)" : "var(--glow-3)",
          opacity: 0.9,
        }}
      />

      <header className="relative flex items-center gap-3">
        <span className="ring-gradient relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-[13px]">
          <span
            className="absolute inset-0"
            style={{ background: "var(--surface-2)" }}
          />
          <span className="text-fg-2 relative grid size-full place-items-center text-[11px] font-black tracking-tight">
            {meta.symbol.slice(0, 3)}
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="text-fg truncate text-[14px] leading-tight font-bold">
            {meta.symbol}
          </h3>
          <p className="text-fg-3 truncate text-[11.5px]">{meta.longName}</p>
        </div>

        <span
          className="num shrink-0 rounded-full px-2 py-[3px] text-[11.5px] font-bold"
          style={{
            color: isBullish ? "var(--up)" : "var(--down)",
            background: isBullish
              ? "color-mix(in srgb, var(--up) 15%, transparent)"
              : "color-mix(in srgb, var(--down) 15%, transparent)",
          }}
        >
          {changePct >= 0 ? "+" : ""}
          {changePct.toFixed(2)}%
        </span>
      </header>

      <div className="relative mt-4 flex items-end justify-between gap-2">
        <span className="num text-fg text-[26px] leading-none font-extrabold tracking-tight tabular-nums">
          ${meta.regularMarketPrice.toFixed(2)}
        </span>
        <span className="text-fg-3 text-[10px] font-semibold tracking-[0.12em] uppercase">
          USD
        </span>
      </div>

      <div className="relative mt-3 h-[64px] w-full">
        <Sparklines
          data={prices}
          height={64}
          style={{ width: "100%", height: 64 }}
        >
          <SparklinesLine
            style={{
              strokeWidth: 2,
              stroke,
              fill: "none",
              strokeLinecap: "round",
              strokeLinejoin: "round",
            }}
          />
        </Sparklines>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[var(--surface)] to-transparent"
        />
      </div>

      <dl className="border-line/70 relative mt-4 grid grid-cols-3 gap-2 border-t pt-3.5">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <dt className="text-fg-3 truncate text-[10px] font-semibold tracking-wider uppercase">
              {stat.label}
            </dt>
            <dd className="num text-fg truncate text-[12.5px] font-semibold tabular-nums">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </motion.article>
  );
}

export default function EtfList({
  data,
  index = 0,
}: {
  data: YahooFinanceChartResponse;
  index?: number;
}) {
  return <SparkCard data={data} index={index} />;
}
