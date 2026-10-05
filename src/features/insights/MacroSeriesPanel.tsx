"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import {
  Label,
  Panel,
  PanelBox,
  Pill,
  Stat,
  StatGrid,
  toneForSign,
} from "~/components/ui";
import {
  formatNumber,
  formatRelative,
  formatSignedPercent,
} from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { api } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * FX and inflation — the two series the macro page was missing.
 *
 * Frankfurter publishes the **European Central Bank's own reference rates**, which
 * makes it a primary source rather than an aggregator's estimate. The ECB fixes
 * once a business day at a known time, so the figure is a decision rather than an
 * average of whatever a crawler could scrape.
 *
 * Two facts the panel is careful about:
 *
 * - **The weekly EUR change compares the earliest and latest observation in the
 *   requested window, not a fixed 7-day offset.** The ECB does not publish at
 *   weekends, so an offset lands on a missing date roughly a third of the time and
 *   yields no change at all.
 * - **CPI nulls are kept, not dropped.** The World Bank's most recent years are
 *   routinely unpublished, and removing them would make the gap invisible on the
 *   chart while the year-over-year change still had to skip over them.
 */
export default function MacroSeriesPanel() {
  const { locale, t } = useI18n();

  const { data, isLoading, dataUpdatedAt } = api.insights.macroSeries.useQuery(
    {},
    { staleTime: 60 * 60_000, refetchInterval: 6 * 60 * 60_000, retry: false },
  );

  const fx = data?.fx;
  const inflation = useMemo(() => data?.inflation ?? [], [data?.inflation]);

  const fxEntries = useMemo(
    () =>
      Object.entries(fx?.selected ?? {}).filter(
        (entry): entry is [string, number] => entry[1] !== null,
      ),
    [fx?.selected],
  );

  if (isLoading && !data) {
    return (
      <Panel title={t("macroSeries.title")}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="bg-surface-3 h-[74px] animate-pulse rounded-[14px]"
            />
          ))}
        </div>
      </Panel>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="panel px-5 py-5"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-fg text-[13px] font-bold tracking-tight">
            {t("macroSeries.title")}
          </h2>
          <p className="text-fg-3 mt-0.5 max-w-2xl text-[11px] leading-relaxed">
            {t("macroSeries.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="muted" size="sm">
            {t("macroSeries.source")}
          </Pill>
          {fx?.date && (
            <span className="text-fg-3 text-[10.5px]">{fx.date}</span>
          )}
          {dataUpdatedAt > 0 && (
            <span className="text-fg-3 text-[10.5px]">
              {formatRelative(locale, dataUpdatedAt)}
            </span>
          )}
        </div>
      </header>

      <StatGrid min={130} className="mb-4">
        <Stat
          label="EUR"
          value={
            fx?.selected.EUR == null
              ? "—"
              : formatNumber(locale, fx.selected.EUR, {
                  maximumFractionDigits: 4,
                })
          }
          hint={t("macroSeries.fxHint")}
          hintValue={formatSignedPercent(locale, fx?.eurWeekChangePercent ?? null, 2)}
          hintTone={toneForSign(fx?.eurWeekChangePercent ?? null, 0.1)}
        />
        <Stat
          label="JPY"
          value={
            fx?.selected.JPY == null
              ? "—"
              : formatNumber(locale, fx.selected.JPY, {
                  maximumFractionDigits: 2,
                })
          }
        />
        <Stat
          label="TRY"
          value={
            fx?.selected.TRY == null
              ? "—"
              : formatNumber(locale, fx.selected.TRY, {
                  maximumFractionDigits: 2,
                })
          }
          tone="brand"
        />
        <Stat
          label={t("macroSeries.inflationTitle")}
          value={formatNumber(locale, inflation.length)}
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <Label>{t("macroSeries.fxTitle")}</Label>
            <span className="text-fg-3 text-[10px]">{t("macroSeries.fxHint")}</span>
          </div>
          {fxEntries.length === 0 ? (
            <PanelBox>
              <p className="text-fg-3 text-[11px]">
                {fx?.error ?? "—"}
              </p>
            </PanelBox>
          ) : (
            <div className="flex flex-col gap-1">
              {fxEntries.map(([currency, rate]) => (
                <div
                  key={currency}
                  className="border-line bg-surface-2/40 flex items-baseline justify-between rounded-[10px] border px-3 py-2"
                >
                  <span className="text-fg text-[12px] font-bold">{currency}</span>
                  <span
                    dir="ltr"
                    className="num text-fg-2 text-[12px] font-bold tabular-nums"
                  >
                    {formatNumber(locale, rate, { maximumFractionDigits: 4 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <Label>{t("macroSeries.inflationTitle")}</Label>
            <span className="text-fg-3 text-[10px]">
              {t("macroSeries.inflationHint")}
            </span>
          </div>
          {inflation.length === 0 ? (
            <PanelBox>
              <p className="text-fg-3 text-[11px]">
                {data?.error ?? t("macroSeries.noInflation")}
              </p>
            </PanelBox>
          ) : (
            <div className="flex flex-col gap-1">
              {inflation.map((series) => (
                <div
                  key={series.country}
                  className="border-line bg-surface-2/40 flex items-center gap-3 rounded-[10px] border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-fg block truncate text-[12px] font-semibold">
                      {series.country}
                    </span>
                    <span className="text-fg-3 block truncate text-[10px]">
                      {series.label}
                      {series.latestYear ? ` · ${series.latestYear}` : ""}
                    </span>
                  </div>
                  <div className="w-[72px] shrink-0 text-end">
                    <Label>{t("macroSeries.latest")}</Label>
                    <span className="num text-fg block text-[12px] font-bold tabular-nums">
                      {formatNumber(locale, series.latest, {
                        maximumFractionDigits: 1,
                      })}
                    </span>
                  </div>
                  <div className="w-[64px] shrink-0 text-end">
                    <Label tone={toneForSign(series.changePercent ?? null, 0.01)}>
                      {t("macroSeries.yoy")}
                    </Label>
                    <span
                      className="num block text-[12px] font-bold tabular-nums"
                      style={{
                        color: `var(--${
                          series.changePercent === null
                            ? "text-3"
                            : series.changePercent > 0.01
                              ? "up"
                              : series.changePercent < -0.01
                                ? "down"
                                : "text-2"
                        })`,
                      }}
                    >
                      {formatSignedPercent(locale, series.changePercent, 2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}