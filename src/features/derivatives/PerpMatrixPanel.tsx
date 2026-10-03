"use client";

import { Segmented } from "antd";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Label,
  Panel,
  PanelSection,
  Stat,
  StatGrid,
  TONE_COLOR,
  toneForSign,
} from "~/components/ui";
import { formatCompact, formatNumber, formatRelative } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type { VenueId } from "~/services/derivatives/venue.port";
import { api } from "~/trpc/react";
import VenueReport from "./VenueReport";

/** One venue's restated rate for the selected coin. */
type VenueRate = { venue: VenueId; rate: number; oiUsd: number | null };

const EASE = [0.16, 1, 0.3, 1] as const;

/** The coins a reader actually looks for, and the four with the deepest books. */
const COINS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "BNB", "ADA", "AVAX"];

/**
 * Funding rates on one coin, one bar per venue.
 *
 * Exists because the *disagreement* is the content. A single average funding
 * number is a comfort blanket over seven venues that may not agree at all, and
 * the case worth noticing is a venue paying far above its peers — a locally
 * crowded book, and the one exchange where being early costs you nothing.
 *
 * Every bar is restated to an 8-hour equivalent first, or Hyperliquid's hourly
 * settlement would show as a quarter of everyone else's rate and read as free
 * shorting. That normalisation happens in the service, not here.
 */
export default function PerpMatrixPanel({
  symbols = COINS.slice(0, 4),
}: {
  symbols?: string[];
}) {
  const { locale, t } = useI18n();
  const [coin, setCoin] = useState<string>(symbols[0] ?? "BTC");

  const { data, isLoading, dataUpdatedAt } = api.derivatives.perps.useQuery(
    { symbols },
    { staleTime: 90_000, refetchInterval: 120_000, retry: false },
  );

  // Memoised because two `useMemo` blocks below read it; `?? []` inline
  // would allocate a fresh array every render and invalidate both.
  const coins = useMemo(() => data?.coins ?? [], [data?.coins]);
  const selected = coins.find((row) => row.symbol === coin) ?? coins[0] ?? null;

  /**
   * Venue rows for the selected coin, richest rate first.
   *
   * Built by accumulation rather than map-then-filter so the null narrowing
   * happens where the rate is computed — a type predicate on a mapped object
   * loses the narrowing the `sort` comparator then depends on.
   */
  const venueRates = useMemo<VenueRate[]>(() => {
    const rows: VenueRate[] = [];
    for (const quote of selected?.quotes ?? []) {
      const rate = normalisedRatePct(
        quote.fundingRate,
        quote.fundingIntervalHours,
      );
      // A venue whose settlement cycle is unknown is left out rather than
      // assumed to be 8h: an assumed cycle is a wrong number wearing a real one.
      if (rate === null) continue;
      rows.push({ venue: quote.venue, rate, oiUsd: quote.openInterestUsd });
    }
    return rows.sort((a, b) => b.rate - a.rate);
  }, [selected]);

  const totalOi = coins.reduce(
    (total, row) => total + (row.openInterestUsd ?? 0),
    0,
  );
  const totalVolume = coins.reduce(
    (total, row) => total + (row.volume24hUsd ?? 0),
    0,
  );

  /**
   * The most crowded coin by funding — the one paying most to hold a long — and
   * the coin whose venues disagree most.
   *
   * `extremes` drops coins with nothing to compare first, so the comparators
   * below compare numbers rather than numbers-and-nulls. A coin that reported no
   * funding is not the *least* crowded; it is unmeasured, and treating it as
   * either extreme would put an unknown at the top of the panel.
   */
  const extremes = useMemo(
    () => ({
      crowded: coins.filter((row) => row.fundingRate8hPct !== null),
      split: coins.filter((row) => row.fundingDispersionPct !== null),
    }),
    [coins],
  );

  const mostCrowded =
    extremes.crowded.length === 0
      ? null
      : extremes.crowded.reduce((worst, row) =>
          (row.fundingRate8hPct ?? 0) > (worst.fundingRate8hPct ?? 0)
            ? row
            : worst,
        );

  const widest =
    extremes.split.length === 0
      ? null
      : extremes.split.reduce((worst, row) =>
          (row.fundingDispersionPct ?? 0) > (worst.fundingDispersionPct ?? 0)
            ? row
            : worst,
        );

  if (isLoading && !data) {
    return (
      <Panel title={t("perps.title")} hint={t("perps.subtitle")}>
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.05 }}
      className="panel px-5 py-5"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-fg text-[13px] font-bold tracking-tight">
            {t("perps.title")}
          </h2>
          <p className="text-fg-3 mt-0.5 max-w-2xl text-[11px] leading-relaxed">
            {t("perps.subtitle")}
          </p>
        </div>
        {dataUpdatedAt && (
          <span className="text-fg-3 text-[10.5px] font-medium">
            {formatRelative(locale, dataUpdatedAt)}
          </span>
        )}
      </header>

      <StatGrid min={150} className="mb-4">
        <Stat
          label={t("perps.totalOi")}
          value={formatCompact(locale, totalOi > 0 ? totalOi : null)}
          hint={`${coins.length} ${t("perps.coins")}`}
          tone="brand"
          size="lg"
        />
        <Stat
          label={t("perps.totalVolume")}
          value={formatCompact(locale, totalVolume > 0 ? totalVolume : null)}
          hint={t("perps.volumeHint")}
          tone="cyan"
        />
        <Stat
          label={t("perps.mostCrowded")}
          value={mostCrowded?.symbol ?? "—"}
          hintValue={
            mostCrowded?.fundingRate8hPct === null ||
            mostCrowded?.fundingRate8hPct === undefined
              ? undefined
              : `${formatNumber(locale, mostCrowded.fundingRate8hPct, {
                  maximumFractionDigits: 4,
                })}%`
          }
          hint={t("perps.mostCrowdedHint")}
          hintTone="amber"
          tone="amber"
        />
        <Stat
          label={t("perps.widestSplit")}
          value={widest?.symbol ?? "—"}
          hintValue={
            widest?.fundingDispersionPct === null ||
            widest?.fundingDispersionPct === undefined
              ? undefined
              : `${formatNumber(locale, widest.fundingDispersionPct, {
                  maximumFractionDigits: 3,
                })}%`
          }
          hint={t("perps.widestSplitHint")}
          tone="neutral"
        />
      </StatGrid>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Label>{t("perps.fundingByVenue")}</Label>
        <Segmented
          size="small"
          value={coin}
          onChange={(value) => setCoin(String(value))}
          options={coins.map((row) => row.symbol)}
        />
      </div>

      <div className="h-[150px]">
        {venueRates.length === 0 ? (
          <p className="text-fg-3 flex h-full items-center justify-center text-[11px]">
            {t("perps.noFunding")}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={venueRates}
              layout="vertical"
              margin={{ top: 0, right: 44, bottom: 0, left: 0 }}
            >
              <CartesianGrid stroke="var(--border)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: "var(--text-3)", fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => `${value.toFixed(3)}%`}
              />
              <YAxis
                type="category"
                dataKey="venue"
                tick={{ fill: "var(--text-2)", fontSize: 9.5 }}
                tickLine={false}
                axisLine={false}
                width={92}
              />
              <Tooltip
                cursor={{ fill: "var(--surface-3)" }}
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 11,
                }}
                formatter={(value) => [
                  `${formatNumber(locale, Number(value), {
                    maximumFractionDigits: 4,
                  })}%`,
                  t("derivatives.funding8h"),
                ]}
              />
              <Bar
                dataKey="rate"
                radius={[0, 3, 3, 0]}
                isAnimationActive={false}
              >
                {venueRates.map((entry) => (
                  <Cell
                    key={entry.venue}
                    fill={entry.rate >= 0 ? TONE_COLOR.down : TONE_COLOR.up}
                  />
                ))}
                <LabelList
                  dataKey="rate"
                  position="right"
                  formatter={(value) =>
                    `${formatNumber(locale, Number(value), { maximumFractionDigits: 3 })}%`
                  }
                  style={{ fill: "var(--text-3)", fontSize: 9 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {coins.length > 0 && (
        <div className="border-line mt-4 border-t pt-3">
          <PanelSection title={t("perps.matrix")} columns={4}>
            {coins.map((row) => (
              <PanelSection key={row.symbol} title={row.symbol} columns={2}>
                <Stat
                  variant="bare"
                  size="sm"
                  label={t("perps.openInterest")}
                  value={formatCompact(locale, row.openInterestUsd)}
                />
                <Stat
                  variant="bare"
                  size="sm"
                  label={t("perps.funding")}
                  value={
                    row.fundingRate8hPct === null
                      ? "—"
                      : `${formatNumber(locale, row.fundingRate8hPct, {
                          maximumFractionDigits: 4,
                        })}%`
                  }
                  tone={toneForSign(row.fundingRate8hPct, 0.005)}
                />
                <Stat
                  variant="bare"
                  size="sm"
                  label={t("perps.volume")}
                  value={formatCompact(locale, row.volume24hUsd)}
                />
                <Stat
                  variant="bare"
                  size="sm"
                  label={t("perps.venues")}
                  value={formatNumber(locale, row.venueCount, {
                    maximumFractionDigits: 0,
                  })}
                  hint={t("perps.venuesHint")}
                />
              </PanelSection>
            ))}
          </PanelSection>
        </div>
      )}

      <div className="border-line mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <span className="text-fg-3 text-[10px]">
          {t("derivativesPage.coverage")}
        </span>
        <VenueReport venues={data?.venues ?? []} />
      </div>
    </motion.section>
  );
}

/**
 * The 8-hour-equivalent rate as a percentage, matching the service's arithmetic.
 *
 * Duplicated rather than imported because the service keeps its fractions private
 * to its own aggregation; the two must stay identical and the function is three
 * lines. A venue with an unknown settlement cycle is dropped rather than assumed
 * to be 8h.
 */
function normalisedRatePct(
  rate: number | null,
  intervalHours: number | null,
): number | null {
  if (rate === null || intervalHours === null || intervalHours <= 0)
    return null;
  return ((rate * 8) / intervalHours) * 100;
}
