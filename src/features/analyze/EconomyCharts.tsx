"use client";

import { motion } from "motion/react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PanelBox } from "~/components/ui";
import { formatNumber } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { countryConfig } from "~/constants/countries";
import type { CountryEconomy } from "~/services/macro/countryEconomy";

const EASE = [0.16, 1, 0.3, 1] as const;

const GRID = "var(--border)";
const AXIS = "var(--text-3)";

/** Recharts hands tooltips loosely typed values; the series are all numbers. */
function toNumber(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/** A chart card. `PanelBox` plus the entrance, which the design system leaves out. */
function Card({
  title,
  hint,
  children,
  delay = 0,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      className="min-w-0"
    >
      <PanelBox title={title} hint={hint} className="h-full">
        <div className="min-w-0 flex-1">{children}</div>
      </PanelBox>
    </motion.div>
  );
}

/**
 * Four charts, one per question.
 *
 * Flow answers "which way is this country heading", the donut answers "how
 * lopsided is the mood", the histogram answers "is the flow one-sided or just
 * busy", and the comparison answers "is this country the driver or the
 * passenger". Four sentences of explanation would answer none of them as
 * quickly.
 */
export default function EconomyCharts({
  economy,
}: {
  economy: CountryEconomy;
}) {
  const { locale, t } = useI18n();

  const total = Math.max(
    1,
    economy.stance.risk_on + economy.stance.neutral + economy.stance.risk_off,
  );

  const stanceData = [
    {
      key: "risk_on" as const,
      name: t("economy.stanceOn"),
      value: economy.stance.risk_on,
      color: "var(--mint)",
    },
    {
      key: "neutral" as const,
      name: t("economy.stanceFlat"),
      value: economy.stance.neutral,
      color: "var(--text-3)",
    },
    {
      key: "risk_off" as const,
      name: t("economy.stanceOff"),
      value: economy.stance.risk_off,
      color: "var(--rose)",
    },
  ];

  const peerData = economy.peers.map((peer) => ({
    name: t(countryConfig(peer.country).labelKey),
    tone: peer.tone,
    risk: peer.risk,
    headlines: peer.headlines,
    coverage: Math.round(peer.coverage * 100),
  }));

  return (
    <div className="grid gap-2.5 lg:grid-cols-2">
      <Card title={t("economy.flowChart")} hint={t("economy.flowHintChart")}>
        <div className="h-[168px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={economy.flow}
              margin={{ top: 4, right: 4, bottom: 0, left: -22 }}
            >
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="hoursAgo"
                tick={{ fill: AXIS, fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                interval={5}
                reversed
              />
              <YAxis
                yAxisId="tone"
                domain={[-100, 100]}
                tick={{ fill: AXIS, fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                width={38}
              />
              <YAxis yAxisId="volume" hide orientation="right" />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 11,
                }}
                labelFormatter={(value) => `${toNumber(value)}h`}
                formatter={(value, name) => [
                  formatNumber(locale, toNumber(value), {
                    maximumFractionDigits: 0,
                  }),
                  String(name),
                ]}
              />
              {/* Volume first, so the tone line draws on top of it. */}
              <Bar
                yAxisId="volume"
                dataKey="count"
                name={t("economy.headlines")}
                fill="var(--brand-2)"
                fillOpacity={0.28}
                barSize={6}
                radius={[2, 2, 0, 0]}
              />
              <Area
                yAxisId="tone"
                type="monotone"
                dataKey="tone"
                name={t("economy.tone")}
                stroke="var(--amber)"
                strokeWidth={2}
                fill="var(--amber)"
                fillOpacity={0.14}
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title={t("economy.stanceChart")}>
        <div className="flex h-[168px] items-center gap-3">
          <div className="relative h-[168px] w-[168px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stanceData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={74}
                  paddingAngle={2}
                  stroke="none"
                >
                  {stanceData.map((slice) => (
                    <Cell key={slice.key} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 11,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="num text-[19px] leading-none font-extrabold tabular-nums">
                {formatNumber(locale, total, { maximumFractionDigits: 0 })}
              </span>
              <span className="text-fg-3 mt-1 text-[9.5px] font-semibold tracking-wider uppercase">
                {t("economy.headlines")}
              </span>
            </div>
          </div>

          <ul className="min-w-0 flex-1 space-y-1.5">
            {stanceData.map((slice) => (
              <li
                key={slice.key}
                className="flex items-center gap-2 text-[11px]"
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: slice.color }}
                />
                <span className="text-fg-2 flex-1 truncate font-semibold">
                  {slice.name}
                </span>
                <span className="num text-fg font-bold tabular-nums">
                  {slice.value}
                </span>
                <span className="num text-fg-3 w-10 text-end tabular-nums">
                  {formatNumber(locale, (slice.value / total) * 100, {
                    maximumFractionDigits: 0,
                  })}
                  %
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card
        title={t("economy.histogramChart")}
        hint={t("economy.histogramHint")}
        delay={0.05}
      >
        <div className="h-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={economy.histogram}
              margin={{ top: 4, right: 4, bottom: 0, left: -26 }}
            >
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="from"
                tick={{ fill: AXIS, fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => value.toFixed(1)}
              />
              <YAxis
                tick={{ fill: AXIS, fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                width={34}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "var(--surface-3)" }}
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 11,
                }}
                labelFormatter={(value) => `${toNumber(value).toFixed(1)} →`}
                formatter={(value) => [
                  formatNumber(locale, toNumber(value), {
                    maximumFractionDigits: 0,
                  }),
                  t("economy.headlines"),
                ]}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {economy.histogram.map((bin) => (
                  <Cell
                    key={bin.from}
                    fill={
                      bin.from < -0.25
                        ? "var(--up)"
                        : bin.from > 0.05
                          ? "var(--down)"
                          : "var(--text-3)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title={t("economy.peersChart")} delay={0.1}>
        <div className="h-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={peerData}
              layout="vertical"
              margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
            >
              <CartesianGrid stroke={GRID} horizontal={false} />
              <XAxis
                type="number"
                domain={[-100, 100]}
                tick={{ fill: AXIS, fontSize: 9 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: AXIS, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={68}
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
                  formatNumber(locale, toNumber(value), {
                    maximumFractionDigits: 0,
                  }),
                  "",
                ]}
              />
              <Bar
                dataKey="tone"
                name={t("economy.tone")}
                fill="var(--amber)"
                radius={[3, 3, 3, 3]}
                barSize={9}
              />
              <Bar
                dataKey="risk"
                name={t("economy.risk")}
                fill="var(--cyan)"
                radius={[3, 3, 3, 3]}
                barSize={9}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
