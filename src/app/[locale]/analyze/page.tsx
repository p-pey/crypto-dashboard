"use client";

import { Segmented, Skeleton } from "antd";
import { motion } from "motion/react";
import { useState } from "react";
import { AnalysisAlerts, AssetCard } from "~/features/analyze/AssetCard";
import NewsFeedPanel from "~/features/analyze/NewsFeedPanel";
import type { TranslationKey } from "~/i18n/dictionaries/types";
import { formatRelative } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { HEADLINE_HORIZON, HORIZON_ORDER } from "~/services/macro/horizons";
import type { Horizon } from "~/services/macro/macro.types";
import { api } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

const UNITS = ["toman", "rial"] as const;
type Unit = (typeof UNITS)[number];

export default function AnalyzePage() {
  const { locale, t } = useI18n();
  const [horizon, setHorizon] = useState<Horizon>(HEADLINE_HORIZON);
  const [unit, setUnit] = useState<Unit>("toman");

  const { data, isLoading, isError, error } = api.macro.analyze.useQuery(
    undefined,
    {
      // Both crawlers cache server side, so a three minute poll is enough to
      // surface a new batch without refetching the news every render.
      staleTime: 120_000,
      refetchInterval: 180_000,
    },
  );

  const unitLabel = t(`nerkh.units.${unit}` as TranslationKey);

  return (
    <div className="flex flex-col gap-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
        className="panel px-5 py-5"
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-fg text-[16px] font-bold tracking-tight">
              {t("analyze.title")}
            </h2>
            <p className="text-fg-3 mt-1 text-[12.5px] leading-relaxed">
              {t("analyze.description")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Segmented<Unit>
              value={unit}
              onChange={setUnit}
              options={UNITS.map((value) => ({
                value,
                label: t(`nerkh.units.${value}` as TranslationKey),
              }))}
            />
            {data && (
              <span className="text-fg-3 text-[11px] font-medium">
                {formatRelative(locale, data.generatedAt)}
              </span>
            )}
          </div>
        </header>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-fg-3 text-[10.5px] font-semibold tracking-[0.12em] uppercase">
            {t("analyze.horizonToggle")}
          </span>
          <Segmented<Horizon>
            value={horizon}
            onChange={setHorizon}
            options={HORIZON_ORDER.map((value) => ({
              value,
              label: t(`analyze.horizons.${value}` as TranslationKey),
            }))}
          />
          <p className="text-fg-3 max-w-xl text-[11.5px] leading-relaxed">
            {t(`analyze.horizonNote.${horizon}` as TranslationKey)}
          </p>
        </div>
      </motion.div>

      {isError && (
        <div className="panel px-5 py-8 text-center">
          <p className="text-down text-[13px]">
            {error instanceof Error
              ? error.message
              : t("analyze.errors.newsFailed")}
          </p>
        </div>
      )}

      {isLoading && !data && (
        <div className="flex flex-col gap-4" aria-hidden>
          {Array.from({ length: 2 }, (_, i) => (
            <div
              key={i}
              className="panel h-[420px] animate-pulse overflow-hidden"
            />
          ))}
        </div>
      )}

      {data && (
        <>
          <AnalysisAlerts
            error={data.error}
            stale={data.stale}
            coverage={data.newsCoverage}
            updatedAt={data.generatedAt}
            unavailable={data.unavailable}
          />

          {data.forecasts.map((forecast) => (
            <AssetCard
              key={forecast.asset}
              forecast={forecast}
              horizon={horizon}
              onHorizon={setHorizon}
              unit={unitLabel}
            />
          ))}

          {isLoading && <Skeleton active paragraph={{ rows: 2 }} />}

          <NewsFeedPanel />

          <p className="text-fg-3 px-1 pb-2 text-center text-[11px] leading-relaxed">
            {t("analyze.disclaimer")}
          </p>
        </>
      )}
    </div>
  );
}
