"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Label,
  Panel,
  Stat,
  StatGrid,
  TONE_COLOR,
  toneForSign,
} from "~/components/ui";
import { formatCompact, formatNumber, formatRelative } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { api } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The CoinGlass answer, built on free venue data.
 *
 * Three things a trader actually reads off a derivatives screen, in the order
 * they matter:
 *
 * 1. **Funding rate.** A persistently positive rate means longs are paying to be
 *    long, which is a crowded position and a poor entry. It moves before price.
 * 2. **Put/call open interest.** Below 1 is call-heavy and bullish-priced; above
 *    1 is hedging. It is positioning, not sentiment, which is why it is more
 *    useful than any survey.
 * 3. **Implied volatility, and its shape across expiries.** The market's own
 *    forecast of future movement. A term structure that slopes upward means the
 *    market prices more risk further out, which is what a genuine uncertainty
 *    looks like; a flat one means nothing is expected to resolve.
 *
 * Every figure comes from the venues' own public endpoints. No aggregator, no
 * key, no scraping.
 */
export default function DerivativesPanel() {
  const { locale, t } = useI18n();

  const { data, isLoading, dataUpdatedAt } = api.derivatives.get.useQuery(
    {},
    { staleTime: 60_000, refetchInterval: 120_000, retry: false },
  );

  const options = data?.options ?? null;
  const perp = data?.perps[0] ?? null;

  const fundingTone = useMemo(() => {
    const last = data?.funding.at(-1)?.rate8h;
    return toneForSign(last, 0.01);
  }, [data?.funding]);

  const failed = (data?.venues ?? []).filter((v) => !v.ok);

  if (isLoading && !data) {
    return (
      <Panel title={t("derivatives.title")}>
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

  const lastFunding = data?.funding.at(-1)?.rate8h ?? null;
  const putCall = options?.putCallRatio ?? null;

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
            {t("derivatives.title")}
          </h2>
          <p className="text-fg-3 mt-0.5 max-w-2xl text-[11px] leading-relaxed">
            {t("derivatives.subtitle")}
          </p>
        </div>
        {dataUpdatedAt && (
          <span className="text-fg-3 text-[10.5px] font-medium">
            {formatRelative(locale, dataUpdatedAt)}
          </span>
        )}
      </header>

      <StatGrid min={140} className="mb-4">
        <Stat
          label={t("derivatives.funding")}
          value={
            lastFunding === null
              ? "—"
              : `${formatNumber(locale, lastFunding, {
                  maximumFractionDigits: 4,
                })}%`
          }
          hint={t("derivatives.funding8h")}
          tone={fundingTone}
        />
        <Stat
          label={t("derivatives.putCall")}
          value={
            putCall === null
              ? "—"
              : formatNumber(locale, putCall, { maximumFractionDigits: 2 })
          }
          hint={
            putCall === null
              ? undefined
              : putCall < 1
                ? t("derivatives.callHeavy")
                : t("derivatives.putHeavy")
          }
          tone={putCall === null ? undefined : putCall < 1 ? "up" : "down"}
          meter={putCall === null ? undefined : Math.min(1, putCall / 2)}
        />
        <Stat
          label={t("derivatives.atmIv")}
          value={
            options?.atmIv === null || options?.atmIv === undefined
              ? "—"
              : `${formatNumber(locale, options.atmIv, { maximumFractionDigits: 1 })}%`
          }
          hint={t("derivatives.atmIvHint")}
          tone="amber"
        />
        <Stat
          label={t("derivatives.perpOi")}
          value={formatCompact(locale, perp?.openInterestUsd ?? null)}
          hint={perp ? t("derivatives.deribitPerp") : undefined}
          tone="brand"
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <Label className="mb-2 block">{t("derivatives.fundingChart")}</Label>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data?.funding ?? []}
                margin={{ top: 4, right: 4, bottom: 0, left: -26 }}
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
                  width={42}
                  tickFormatter={(value: number) => `${value.toFixed(3)}%`}
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
                <Bar dataKey="rate8h" radius={[3, 3, 0, 0]}>
                  {(data?.funding ?? []).map((point) => (
                    <Cell
                      key={point.timestamp}
                      fill={point.rate8h >= 0 ? "var(--rose)" : "var(--mint)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <Label className="mb-2 block">{t("derivatives.termStructure")}</Label>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={options?.byExpiry ?? []}
                margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              >
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="expiry"
                  tick={{ fill: "var(--text-3)", fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--text-3)", fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(value: number) =>
                    `$${Math.round(value / 1e9)}B`
                  }
                />
                <Tooltip
                  cursor={{ fill: "var(--surface-3)" }}
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 11,
                  }}
                  formatter={(value, _name, entry) => {
                    const payload = entry?.payload as
                      { atmIv?: number } | undefined;
                    return [
                      `${formatCompact(locale, Number(value))}${
                        payload?.atmIv
                          ? ` · IV ${payload.atmIv.toFixed(1)}%`
                          : ""
                      }`,
                      t("derivatives.openInterest"),
                    ];
                  }}
                />
                <Bar dataKey="openInterestUsd" radius={[3, 3, 0, 0]}>
                  {(options?.byExpiry ?? []).map((row) => (
                    <Cell key={row.expiry} fill="var(--brand-2)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {options && (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-4">
          <Figure
            label={t("derivatives.totalOi")}
            value={formatCompact(locale, options.openInterestUsd)}
          />
          <Figure
            label={t("derivatives.putOi")}
            value={formatCompact(locale, options.putOpenInterestUsd)}
            tone="down"
          />
          <Figure
            label={t("derivatives.callOi")}
            value={formatCompact(locale, options.callOpenInterestUsd)}
            tone="up"
          />
          <Figure
            label={t("derivatives.optionsVolume")}
            value={formatCompact(locale, options.volumeUsd)}
          />
        </div>
      )}

      {failed.length > 0 && (
        <p className="text-fg-3 mt-3 text-[10px]">
          {t("derivatives.partial")}:{" "}
          {failed.map((venue) => `${venue.label} (${venue.error})`).join(", ")}
        </p>
      )}
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
  tone?: "up" | "down";
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
