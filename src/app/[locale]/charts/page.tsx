"use client";

import { Segmented, Skeleton } from "antd";
import { motion } from "motion/react";
import { useState } from "react";
import CandleChart from "~/features/charts/CandleChart";
import type { TranslationKey } from "~/i18n/dictionaries/types";
import { formatNumber, formatRelative } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import {
  CANDLE_INTERVALS,
  type CandleInterval,
  type CandleSymbol,
} from "~/services/candles/candle.types";
import { api } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Units for the price readout, matching the selected market. */
function unitFor(
  symbol: CandleSymbol,
  dict: { rial: string; toman: string; usd: string },
) {
  if (symbol === "USDIRT" || symbol === "EURIRT" || symbol === "GOLD18IRT") {
    return dict.rial;
  }
  if (symbol === "XAUTUSD") return dict.usd;
  return dict.usd;
}

export default function ChartsPage() {
  const { locale, t, dictionary } = useI18n();
  const [symbol, setSymbol] = useState<CandleSymbol>("BTCUSDT");
  const [interval, setInterval] = useState<CandleInterval>("15m");

  const { data, isLoading, isError, error, dataUpdatedAt } =
    api.candles.get.useQuery(
      { symbol, interval, limit: 320 },
      {
        // The rial pairs are built from live samples, so a short poll keeps the
        // last candle current. CoinGecko markets change far less often.
        refetchInterval: symbol.endsWith("IRT") ? 30_000 : 120_000,
        refetchOnWindowFocus: true,
        staleTime: 20_000,
      },
    );

  const unitLabel = unitFor(symbol, {
    rial: t("nerkh.units.rial"),
    toman: t("nerkh.units.toman"),
    usd: "USD",
  });

  const labelKey = `charts.symbols.${symbol.toLowerCase()}` as TranslationKey;

  return (
    <div className="flex flex-col gap-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="panel px-5 py-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-fg text-[16px] font-bold tracking-tight">
              {t("charts.title")}
            </h2>
            <p className="text-fg-3 mt-0.5 max-w-2xl text-[12px]">
              {t("charts.subtitle")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Segmented<CandleSymbol>
              value={symbol}
              onChange={setSymbol}
              options={[
                "BTCUSDT",
                "ETHUSDT",
                "SOLUSDT",
                "XAUTUSD",
                "USDIRT",
                "EURIRT",
                "GOLD18IRT",
              ].map((value) => ({
                value: value as CandleSymbol,
                label: t(
                  `charts.symbols.${value.toLowerCase()}` as TranslationKey,
                ),
              }))}
            />
            <Segmented<CandleInterval>
              value={interval}
              onChange={setInterval}
              options={CANDLE_INTERVALS.map((value) => ({
                value,
                label: t(`charts.intervals.${value}` as TranslationKey),
              }))}
            />
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05, ease: EASE }}
        className="panel px-5 py-4"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h3 className="text-fg text-[15px] font-bold">
              {t(labelKey)}
              <span
                dir="ltr"
                className="mono text-fg-3 ms-2 text-[12px] font-normal"
              >
                {symbol}
              </span>
            </h3>
            {data?.candles.length ? (
              <span className="num text-fg-2 text-[20px] font-extrabold tabular-nums">
                {formatNumber(
                  locale,
                  data.candles[data.candles.length - 1]?.close,
                  {
                    maximumFractionDigits: 2,
                  },
                )}{" "}
                <span className="text-fg-3 text-[12px]">{unitLabel}</span>
              </span>
            ) : null}
          </div>

          {data && (
            <span className="text-fg-3 text-[11px] font-medium">
              {data.candles.length} {t("charts.candles")} ·{" "}
              {formatRelative(locale, dataUpdatedAt || data.fetchedAt)}
            </span>
          )}
        </div>

        {/* Aggregated markets have no published history; say so rather than
            letting a three-hour chart look like a five-year one. */}
        {data?.aggregated && (
          <p className="border-line bg-surface-2/60 mb-3 rounded-[10px] border px-3 py-2 text-[11px] leading-relaxed">
            {t("charts.aggregatedNote")}{" "}
            <span className="num font-semibold">
              {data.collectingSince
                ? formatRelative(locale, data.collectingSince)
                : "—"}
            </span>
          </p>
        )}

        {isError && (
          <p className="text-down py-8 text-center text-[13px]">
            {error instanceof Error ? error.message : t("charts.error")}
          </p>
        )}

        {isLoading && !data && <Skeleton active paragraph={{ rows: 8 }} />}

        {data?.candles.length === 0 && !isError && (
          <p className="text-fg-3 py-12 text-center text-[13px]">
            {t("charts.empty")}
          </p>
        )}

        {data && data.candles.length > 0 && (
          <CandleChart
            candles={data.candles}
            interval={interval}
            unitLabel={unitLabel}
          />
        )}

        <p className="text-fg-3 mt-3 text-center text-[10.5px]">
          {t("charts.legend")} · MA 20 · {dictionary.common.trend}:{" "}
          {t("charts.maNote")}
        </p>
      </motion.div>
    </div>
  );
}
