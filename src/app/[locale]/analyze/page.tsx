"use client";

import { Segmented, Skeleton } from "antd";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { AnalysisAlerts, AssetCard } from "~/features/analyze/AssetCard";
import CountryFeed from "~/features/analyze/CountryFeed";
import CountrySelector from "~/features/analyze/CountrySelector";
import EconomyCharts from "~/features/analyze/EconomyCharts";
import EconomyKpis from "~/features/analyze/EconomyKpis";
import FactorBars from "~/features/analyze/FactorBars";
import LocalAiPanel from "~/features/analyze/LocalAiPanel";
import type { TranslationKey } from "~/i18n/dictionaries/types";
import { formatRelative } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { COUNTRIES, DEFAULT_COUNTRY } from "~/constants/countries";
import type { CountryId } from "~/constants/countries";
import { HEADLINE_HORIZON, HORIZON_ORDER } from "~/services/macro/horizons";
import type { Horizon } from "~/services/macro/macro.types";
import { api } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

const UNITS = ["toman", "rial"] as const;
type Unit = (typeof UNITS)[number];

/**
 * The analysis page, in the order the questions are actually asked.
 *
 * Country first, because every figure below is scoped to it. Then the scorecard,
 * the charts, the channels doing the work, the deterministic price projection,
 * and finally the local model's read of all of it. The prose that used to lead
 * the page is gone: the panels carry their own one-line legends and the
 * numbers do the talking.
 */
export default function AnalyzePage() {
  const { locale, t } = useI18n();
  const [country, setCountry] = useState<CountryId>(DEFAULT_COUNTRY);
  const [horizon, setHorizon] = useState<Horizon>(HEADLINE_HORIZON);
  const [unit, setUnit] = useState<Unit>("toman");

  const economy = api.macro.economy.useQuery(
    { country },
    {
      // The crawler caches server side, so a three minute poll is enough to
      // surface a new batch without refetching the news every render.
      staleTime: 120_000,
      refetchInterval: 180_000,
    },
  );

  const forecasts = api.macro.analyze.useQuery(undefined, {
    staleTime: 120_000,
    refetchInterval: 180_000,
  });

  const selected = economy.data?.selected ?? null;

  const unitLabel = t(`nerkh.units.${unit}` as TranslationKey);

  const headlineLabels = useMemo(
    () =>
      Object.fromEntries(
        COUNTRIES.map((entry) => [
          entry.id,
          t(entry.labelKey as TranslationKey),
        ]),
      ) as Record<CountryId, string>,
    [t],
  );

  const countryCounts = useMemo(() => {
    const counts: Partial<
      Record<CountryId, { headlines: number; tone: number }>
    > = {};
    // The peers block already carries every country's tone and headline count,
    // so the selector does not need a second request to show them.
    const peers = selected?.peers ?? [];
    for (const peer of peers) {
      counts[peer.country] = { headlines: peer.headlines, tone: peer.tone };
    }
    if (selected && !counts[selected.country]) {
      counts[selected.country] = {
        headlines: selected.headlines24h,
        tone: selected.tone,
      };
    }
    return counts;
  }, [selected]);

  return (
    <div className="flex flex-col gap-3">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <CountrySelector
          value={country}
          onChange={setCountry}
          counts={countryCounts}
        />
      </motion.div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Horizon>
            value={horizon}
            onChange={setHorizon}
            options={HORIZON_ORDER.map((value) => ({
              value,
              label: t(`analyze.horizons.${value}` as TranslationKey),
            }))}
          />
          <Segmented<Unit>
            value={unit}
            onChange={setUnit}
            options={UNITS.map((value) => ({
              value,
              label: t(`nerkh.units.${value}` as TranslationKey),
            }))}
          />
        </div>

        {economy.data && (
          <span className="text-fg-3 text-[11px] font-medium">
            {formatRelative(locale, economy.data.fetchedAt)}
          </span>
        )}
      </div>

      {economy.isError && (
        <div className="panel px-5 py-8 text-center">
          <p className="text-down text-[13px]">
            {economy.error instanceof Error
              ? economy.error.message
              : t("analyze.errors.newsFailed")}
          </p>
        </div>
      )}

      {economy.isLoading && !selected && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="panel h-[86px] animate-pulse" />
          ))}
        </div>
      )}

      {selected && (
        <>
          <motion.div
            key={country}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            <EconomyKpis economy={selected} />
          </motion.div>

          <EconomyCharts economy={selected} />

          <div className="grid gap-3 xl:grid-cols-[1.15fr_1fr]">
            <FactorBars factors={selected.factors} />
            <CountryFeed articles={selected.top} loading={economy.isLoading} />
          </div>

          <AnalysisAlerts
            error={economy.data?.error ?? null}
            stale={economy.data?.stale ?? false}
            coverage={selected.coverage}
            updatedAt={economy.data?.fetchedAt ?? null}
            unavailable={[]}
          />

          {forecasts.isError && (
            <div className="panel px-5 py-6 text-center">
              <p className="text-down text-[12.5px]">
                {forecasts.error instanceof Error
                  ? forecasts.error.message
                  : t("analyze.errors.priceFailed")}
              </p>
            </div>
          )}

          {forecasts.data?.forecasts.map((forecast) => (
            <AssetCard
              key={forecast.asset}
              forecast={forecast}
              horizon={horizon}
              onHorizon={setHorizon}
              unit={unitLabel}
            />
          ))}

          {forecasts.isLoading && !forecasts.data && (
            <Skeleton active paragraph={{ rows: 3 }} />
          )}

          <LocalAiPanel
            country={country}
            countryLabel={headlineLabels[country]}
            horizon={horizon}
            horizonLabel={t(`analyze.horizons.${horizon}` as TranslationKey)}
          />

          <p className="text-fg-3 px-1 pb-2 text-center text-[10.5px] leading-relaxed">
            {t("analyze.disclaimer")}
          </p>
        </>
      )}
    </div>
  );
}
