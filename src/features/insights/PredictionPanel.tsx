"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import {
  Label,
  Meter,
  Panel,
  PanelBox,
  Pill,
  Stat,
  StatGrid,
} from "~/components/ui";
import {
  formatCompact,
  formatDateTime,
  formatNumber,
  formatRelative,
} from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { api } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Prediction markets, from Polymarket's public Gamma API.
 *
 * Why this belongs on a crypto dashboard rather than in a politics section: it is
 * the only continuously-updated, **money-backed** probability anywhere in the
 * free data layer. An RSI says what price has done; a funding rate says what
 * positioning has built up. This says what people will lose money on if they are
 * wrong — which is a different and often more honest signal than either.
 *
 * Markets are filtered to crypto-relevant questions. That filter is not
 * cosmetic: Polymarket's highest-volume markets are elections and geopolitics,
 * and `filteredOut` is reported so a reader seeing four crypto markets knows the
 * raw response held two hundred.
 */
export default function PredictionPanel() {
  const { locale, t } = useI18n();

  const { data, isLoading, dataUpdatedAt } = api.insights.predictionMarkets.useQuery(
    {},
    { staleTime: 2 * 60_000, refetchInterval: 5 * 60_000, retry: false },
  );

  const markets = useMemo(
    () => (data?.markets ?? []).slice(0, 12),
    [data?.markets],
  );

  if (isLoading && !data) {
    return (
      <Panel title={t("prediction.title")}>
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

  const totals = data?.totals;

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
            {t("prediction.title")}
          </h2>
          <p className="text-fg-3 mt-0.5 max-w-2xl text-[11px] leading-relaxed">
            {t("prediction.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="muted" size="sm">
            {t("prediction.source")}
          </Pill>
          {dataUpdatedAt > 0 && (
            <span className="text-fg-3 text-[10.5px]">
              {formatRelative(locale, dataUpdatedAt)}
            </span>
          )}
        </div>
      </header>

      <StatGrid min={130} className="mb-4">
        <Stat
          label={t("prediction.markets")}
          value={formatNumber(locale, totals?.markets ?? null)}
        />
        <Stat
          label={t("prediction.totalLiquidity")}
          value={formatCompact(locale, totals?.liquidity)}
        />
        <Stat
          label={t("prediction.volume")}
          value={formatCompact(locale, totals?.volume24h)}
        />
        <Stat
          label={t("prediction.nearSettled")}
          value={formatNumber(locale, totals?.nearSettled ?? null)}
          hint={`${t("prediction.filteredOut")}: ${formatNumber(locale, data?.filteredOut ?? null)}`}
          tone="amber"
        />
      </StatGrid>

      {markets.length === 0 ? (
        <PanelBox>
          <p className="text-fg-3 text-[11px]">{data?.error ?? t("prediction.noMarkets")}</p>
        </PanelBox>
      ) : (
        <div className="flex flex-col gap-1">
          {markets.map((market) => {
            const top = market.topProbability ?? null;
            const underdog = market.underdogProbability ?? null;

            // The meter shows the favourite's share, so a 99/1 market fills it
            // completely and a genuine 50/50 fills it halfway — which is exactly
            // the read a probability bar is for.
            const favouriteTone =
              top === null
                ? "muted"
                : top >= 0.9
                  ? "up"
                  : top >= 0.6
                    ? "brand"
                    : "neutral";

            return (
              <div
                key={market.id}
                className="border-line bg-surface-2/40 flex flex-col gap-1.5 rounded-[10px] border px-3 py-2"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-fg block text-[12px] leading-snug font-semibold">
                      {market.question}
                    </span>
                    <span className="text-fg-3 mt-0.5 block truncate text-[10px]">
                      {market.topOutcome ?? "—"} {t("prediction.probability")} ·{" "}
                      {market.endDate
                        ? `${t("prediction.closes")} ${formatDateTime(locale, Date.parse(market.endDate))}`
                        : "—"}
                    </span>
                  </div>

                  <div className="w-[96px] shrink-0 text-end">
                    <Label tone={favouriteTone}>{market.topOutcome ?? "—"}</Label>
                    <span
                      dir="ltr"
                      className="num block text-[13px] font-extrabold tabular-nums"
                      style={{
                        color:
                          top === null
                            ? "var(--text-3)"
                            : `var(--${favouriteTone === "muted" ? "text-2" : favouriteTone === "brand" ? "brand-2" : favouriteTone})`,
                      }}
                    >
                      {top === null
                        ? "—"
                        : formatNumber(locale, top * 100, {
                            maximumFractionDigits: 1,
                          }) + "%"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <Meter
                      value={top ?? 0}
                      diverging={false}
                      tone={favouriteTone}
                    />
                  </div>
                  <span className="text-fg-3 w-[76px] shrink-0 text-end text-[10px]">
                    {market.underdogOutcome ?? "—"} {underdog === null
                      ? ""
                      : formatNumber(locale, underdog * 100, {
                          maximumFractionDigits: 1,
                        }) + "%"}
                  </span>
                  <span className="text-fg-2 w-[70px] shrink-0 text-end text-[11px] font-bold tabular-nums">
                    {formatCompact(locale, market.liquidity)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.section>
  );
}