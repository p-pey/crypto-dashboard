"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  type Tone,
} from "~/components/ui";
import { formatCompact, formatNumber, formatRelative } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { api } from "~/trpc/react";
import VenueReport from "./VenueReport";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Forced liquidations — the figure CoinGlass is built around, assembled from the
 * two venues that publish a REST tape.
 *
 * **Read the chart, not the total.** Liquidations are a *rate*: a hundred
 * million over two hours means something completely different depending on
 * whether it arrived evenly or in one minute. The stacked bars are the panel's
 * real content and the headline number is a summary of them — which is why the
 * chart is the largest element here rather than one tile in a row of four.
 *
 * The stack is long against short, and the colours are the semantic ones: a
 * forced **long** close is someone being sold out, so it is the negative side;
 * a forced **short** close is someone being bought out, the positive side. A
 * long-liquidation spike is a selloff; a short-liquidation spike is a squeeze.
 * They look like mirror images on this chart and are not, which is exactly why
 * they are stacked rather than totalled.
 *
 * **The absence of data is shown, not implied.** Two venues publish this tape and
 * four do not, so the panel names its sources and the four are listed as
 * unsupported rather than silently missing. See {@link VenueReport}.
 */
export default function LiquidationsPanel({ symbols }: { symbols?: string[] }) {
  const { locale, t } = useI18n();

  const { data, isLoading, dataUpdatedAt } =
    api.derivatives.liquidations.useQuery(symbols ? { symbols } : {}, {
      staleTime: 60_000,
      refetchInterval: 60_000,
      retry: false,
    });

  const publishing = data?.coverage ?? [];
  const answered = (data?.venues ?? []).filter(
    (venue) => !venue.unsupported && venue.ok,
  );

  /**
   * The distinction the whole panel turns on: a quiet market and a blocked feed
   * are both "no bars", and only one of them means the market is calm.
   */
  const blocked = answered.length === 0 && publishing.length > 0;

  const longShare = useMemo(() => {
    const total = data?.windowUsd ?? 0;
    return total > 0 ? (data?.windowLongUsd ?? 0) / total : null;
  }, [data?.windowUsd, data?.windowLongUsd]);

  const burst = data?.burstRatio ?? null;
  const burstTone =
    burst === null
      ? "muted"
      : burst >= 4
        ? "down"
        : burst >= 2
          ? "amber"
          : "up";

  if (isLoading && !data) {
    return (
      <Panel title={t("liquidations.title")} hint={t("liquidations.subtitle")}>
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
      transition={{ duration: 0.5, ease: EASE }}
      className="panel px-5 py-5"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-fg text-[13px] font-bold tracking-tight">
            {t("liquidations.title")}
          </h2>
          <p className="text-fg-3 mt-0.5 max-w-2xl text-[11px] leading-relaxed">
            {t("liquidations.subtitle")}
          </p>
        </div>
        {dataUpdatedAt && (
          <span className="text-fg-3 text-[10.5px] font-medium">
            {formatRelative(locale, dataUpdatedAt)}
          </span>
        )}
      </header>

      {data?.stale && (
        <p className="border-line bg-surface-2/50 mb-3 rounded-[10px] border px-3 py-2 text-[11px]">
          <span className="text-amber">{t("derivativesPage.stale")}</span>{" "}
          <span className="text-fg-3">{data.staleReason}</span>
        </p>
      )}

      {blocked ? (
        <div className="border-line bg-surface-2/40 rounded-[14px] border px-4 py-6 text-center">
          <p className="text-fg text-[12px] font-bold">
            {t("liquidations.blockedTitle")}
          </p>
          <p className="text-fg-3 mx-auto mt-1 max-w-md text-[11px] leading-relaxed">
            {t("liquidations.blockedHint")}
          </p>
          <VenueReport
            venues={data?.venues ?? []}
            className="mt-3 justify-center"
          />
        </div>
      ) : (
        <>
          <StatGrid min={150} className="mb-4">
            <Stat
              label={t("liquidations.window")}
              value={formatCompact(locale, data?.windowUsd ?? null)}
              hint={t("liquidations.windowHint")}
              hintValue={
                data?.printCount === undefined
                  ? undefined
                  : `${data.printCount} ${t("liquidations.prints")}`
              }
              hintTone={null}
              tone="brand"
              size="lg"
            />
            <Stat
              label={t("liquidations.liquidatedLong")}
              value={formatCompact(locale, data?.windowLongUsd ?? null)}
              hint={
                longShare === null
                  ? undefined
                  : `${formatNumber(locale, longShare * 100, {
                      maximumFractionDigits: 0,
                    })}% ${t("liquidations.ofTotal")}`
              }
              tone="down"
            />
            <Stat
              label={t("liquidations.liquidatedShort")}
              value={formatCompact(locale, data?.windowShortUsd ?? null)}
              hint={
                longShare === null
                  ? undefined
                  : `${formatNumber(locale, (1 - longShare) * 100, {
                      maximumFractionDigits: 0,
                    })}% ${t("liquidations.ofTotal")}`
              }
              tone="up"
            />
            <Stat
              label={t("liquidations.burst")}
              value={
                burst === null
                  ? "—"
                  : `${formatNumber(locale, burst, { maximumFractionDigits: 1 })}×`
              }
              hint={t("liquidations.burstHint")}
              tone={burstTone}
              // Against 8× the median: past that the bar is full and the exact
              // ratio stops mattering, the colour takes over.
              meter={burst === null ? undefined : Math.min(1, burst / 8)}
            />
          </StatGrid>

          <Label className="mb-2 block">{t("liquidations.series")}</Label>
          <div className="h-[168px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data?.buckets ?? []}
                margin={{ top: 4, right: 4, bottom: 0, left: -22 }}
              >
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(value: number) =>
                    new Date(value).toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }
                  tick={{ fill: "var(--text-3)", fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  interval={5}
                />
                <YAxis
                  tick={{ fill: "var(--text-3)", fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(value: number) => `$${compactTick(value)}`}
                />
                <Tooltip
                  cursor={{ fill: "var(--surface-3)" }}
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 11,
                  }}
                  formatter={(value, name) => [
                    formatCompact(locale, Number(value)),
                    name === "longUsd"
                      ? t("liquidations.liquidatedLong")
                      : t("liquidations.liquidatedShort"),
                  ]}
                />
                {/* Order matters: the negative side sits at the bottom of the
                    stack so a long-liquidation cluster reads as the base of a
                    bar growing upward, which is what a selloff looks like. */}
                <Bar
                  dataKey="longUsd"
                  stackId="liq"
                  fill={TONE_COLOR.down}
                  radius={[0, 0, 0, 0]}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="shortUsd"
                  stackId="liq"
                  fill={TONE_COLOR.up}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {data && data.buckets.every((bucket) => bucket.totalUsd === 0) && (
            <p className="text-fg-3 mt-2 text-[10.5px]">
              {t("liquidations.calm")}
            </p>
          )}

          {data?.largest && (
            <div className="border-line mt-4 border-t pt-3">
              <PanelSection title={t("liquidations.largest")} columns={4}>
                <Figure
                  label={t("liquidations.coin")}
                  value={data.largest.symbol}
                />
                <Figure
                  label={t("derivatives.openInterest")}
                  value={formatCompact(locale, data.largest.usd)}
                  tone={data.largest.side === "long" ? "down" : "up"}
                />
                <Figure
                  label={t("liquidations.side")}
                  value={
                    data.largest.side === "long"
                      ? t("liquidations.longSide")
                      : t("liquidations.shortSide")
                  }
                />
                <Figure
                  label={t("derivatives.updated")}
                  value={
                    data.largest.price === null
                      ? "—"
                      : formatCompact(locale, data.largest.price)
                  }
                />
              </PanelSection>
            </div>
          )}

          {data && data.bySymbol.length > 0 && (
            <div className="border-line mt-4 border-t pt-3">
              <PanelSection title={t("liquidations.bySymbol")} columns={4}>
                {data.bySymbol.slice(0, 4).map((row) => (
                  <Figure
                    key={row.symbol}
                    label={row.symbol}
                    value={formatCompact(locale, row.usd)}
                    tone={toneForSign(
                      row.longUsd - row.shortUsd,
                      row.usd * 0.1,
                    )}
                  />
                ))}
              </PanelSection>
            </div>
          )}
        </>
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

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <p
        dir="ltr"
        className="num mt-0.5 text-[13px] font-bold tabular-nums"
        style={{ color: tone ? TONE_COLOR[tone] : "var(--fg)" }}
      >
        {value}
      </p>
    </div>
  );
}

/** Axis ticks in the `$1.2M` shape, without pulling in a currency formatter. */
function compactTick(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toFixed(0);
}
