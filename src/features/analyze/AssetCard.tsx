"use client";

import { Alert, Progress, Tag, Tooltip } from "antd";
import { motion } from "motion/react";
import { useMemo } from "react";
import type { TranslationKey } from "~/i18n/dictionaries/types";
import { formatNumber, formatPercent, formatRelative } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type {
  AssetForecast,
  ForecastSignal,
  Horizon,
  HorizonForecast,
} from "~/services/macro/macro.types";

const EASE = [0.16, 1, 0.3, 1] as const;

type Verdict = "bullish" | "bearish" | "neutral";

const VERDICT_STYLE: Record<Verdict, { color: string; key: TranslationKey }> = {
  bullish: { color: "var(--up)", key: "analyze.verdict.bullish" },
  bearish: { color: "var(--down)", key: "analyze.verdict.bearish" },
  neutral: { color: "var(--text-2)", key: "analyze.verdict.neutral" },
};

const SIGNAL_KEYS: Record<ForecastSignal["key"], TranslationKey> = {
  newsSentiment: "analyze.signals.newsSentiment",
  macroPressure: "analyze.signals.macroPressure",
  momentum1h: "analyze.signals.momentum1h",
  momentum12h: "analyze.signals.momentum12h",
  intradayRange: "analyze.signals.intradayRange",
  newsRecency: "analyze.signals.newsRecency",
  goldPremium: "analyze.signals.goldPremium",
};

function money(value: number, locale: "fa" | "en" | "de"): string {
  return formatNumber(locale, value, { maximumFractionDigits: 0 });
}

/** Drift bar: -100..100 rendered as a diverging bar around the midpoint. */
function DriftBar({ score, available }: { score: number; available: boolean }) {
  if (!available) {
    return <div className="bg-surface-3 h-2 w-full rounded-full" aria-hidden />;
  }
  const magnitude = Math.min(50, Math.abs(score) / 2);
  const positive = score >= 0;

  return (
    <div className="bg-surface-3 relative h-2 w-full overflow-hidden rounded-full">
      <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--border-strong)]" />
      <span
        className="absolute inset-y-0 rounded-full transition-all duration-500"
        style={{
          width: `${magnitude}%`,
          insetInlineStart: positive ? "50%" : undefined,
          insetInlineEnd: positive ? undefined : "50%",
          background: positive ? "var(--up)" : "var(--down)",
        }}
      />
    </div>
  );
}

function SignalRow({ signal }: { signal: ForecastSignal }) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`text-[12px] font-semibold ${
            signal.available ? "text-fg-2" : "text-fg-3"
          }`}
        >
          {t(SIGNAL_KEYS[signal.key])}
        </span>
        <span
          dir="ltr"
          className="num text-[12px] font-bold tabular-nums"
          style={{
            color: !signal.available
              ? "var(--text-3)"
              : signal.score > 2
                ? "var(--up)"
                : signal.score < -2
                  ? "var(--down)"
                  : "var(--text-2)",
          }}
        >
          {signal.available
            ? `${signal.score > 0 ? "+" : ""}${Math.round(signal.score)}`
            : "—"}
        </span>
      </div>
      <DriftBar score={signal.score} available={signal.available} />
      {signal.detail && (
        <Tooltip title={signal.detail}>
          <p className="text-fg-3 truncate text-[10.5px]">{signal.detail}</p>
        </Tooltip>
      )}
    </div>
  );
}

function HorizonCard({
  forecast,
  horizon,
  active,
  unit,
  onSelect,
}: {
  forecast: HorizonForecast;
  horizon: Horizon;
  active: boolean;
  unit: string;
  onSelect: (horizon: Horizon) => void;
}) {
  const { locale, t } = useI18n();
  const style = VERDICT_STYLE[forecast.verdict];
  const band = forecast.band;

  return (
    <button
      type="button"
      onClick={() => onSelect(horizon)}
      aria-pressed={active}
      className={`panel flex flex-col gap-2 px-4 py-3.5 text-start transition-all duration-300 ${
        active
          ? "border-brand/60 shadow-[0_0_0_1px_var(--ring),0_18px_50px_-24px_var(--glow-1)]"
          : "opacity-80 hover:opacity-100"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-fg-3 text-[10.5px] font-semibold tracking-[0.12em] uppercase">
          {t(`analyze.horizons.${horizon}` as TranslationKey)}
        </span>
        <span
          className="rounded-full px-2 py-[2px] text-[10.5px] font-bold"
          style={{
            color: style.color,
            background: "color-mix(in srgb, currentColor 12%, transparent)",
          }}
        >
          {t(style.key)}
        </span>
      </div>

      <p
        className="num text-[19px] leading-none font-extrabold tabular-nums"
        style={{ color: style.color }}
      >
        {band ? `${money(band.mid, locale)} ${unit}` : "—"}
      </p>

      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span
          className="num font-semibold tabular-nums"
          style={{
            color:
              forecast.driftPercent > 0
                ? "var(--up)"
                : forecast.driftPercent < 0
                  ? "var(--down)"
                  : "var(--text-3)",
          }}
        >
          {formatPercent(locale, forecast.driftPercent)}
        </span>
        <span className="text-fg-3 num tabular-nums">
          {formatPercent(locale, forecast.confidence * 100, 0)}{" "}
          {t("common.percent")}
        </span>
      </div>

      {band && (
        <p className="text-fg-3 num text-[10.5px] tabular-nums">
          {money(band.low, locale)} — {money(band.high, locale)}
        </p>
      )}
    </button>
  );
}

export function AssetCard({
  forecast,
  horizon,
  onHorizon,
  unit,
}: {
  forecast: AssetForecast;
  horizon: Horizon;
  onHorizon: (horizon: Horizon) => void;
  unit: string;
}) {
  const { locale, t } = useI18n();
  const selected =
    forecast.byHorizon.find((entry) => entry.horizon === horizon) ??
    forecast.headline;

  const style = selected
    ? VERDICT_STYLE[selected.verdict]
    : VERDICT_STYLE.neutral;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="panel px-5 py-5"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h3 className="text-fg text-[15px] font-bold tracking-tight">
            {t(`analyze.asset.${forecast.asset}` as TranslationKey)}
          </h3>
          <span
            dir="ltr"
            className="mono text-fg-3 rounded-md bg-[var(--surface-3)] px-1.5 py-0.5 text-[10.5px]"
          >
            {forecast.instrument}
          </span>
          {!forecast.available && (
            <Tag color="warning">{t("common.unavailable")}</Tag>
          )}
        </div>

        {selected && (
          <div className="flex items-center gap-2">
            <Tag
              color={
                selected.verdict === "bullish"
                  ? "green"
                  : selected.verdict === "bearish"
                    ? "red"
                    : "default"
              }
              style={{ fontWeight: 700 }}
            >
              {t(`analyze.horizons.${selected.horizon}` as TranslationKey)}
            </Tag>
            <span className="text-fg-3 text-[11px] font-semibold">
              {t(`analyze.verdict.${selected.verdict}`)}
            </span>
          </div>
        )}
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cell
          label={t("analyze.stats.spot")}
          value={
            forecast.spot === null
              ? "—"
              : `${money(forecast.spot, locale)} ${unit}`
          }
          accent="var(--text)"
        />
        <Cell
          label={t("analyze.stats.target")}
          value={
            selected?.band ? `${money(selected.band.mid, locale)} ${unit}` : "—"
          }
          accent={style.color}
        />
        <Cell
          label={t("analyze.stats.drift")}
          value={selected ? formatPercent(locale, selected.driftPercent) : "—"}
          accent={style.color}
        />
        <Cell
          label={t("analyze.stats.confidence")}
          value={
            selected ? formatPercent(locale, selected.confidence * 100, 0) : "—"
          }
          accent="var(--brand-2)"
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {forecast.byHorizon.map((entry) => (
          <HorizonCard
            key={entry.horizon}
            forecast={entry}
            horizon={entry.horizon}
            active={entry.horizon === horizon}
            unit={unit}
            onSelect={onHorizon}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border-line flex flex-col gap-3 rounded-[14px] border p-4">
          <p className="text-fg-3 text-[10.5px] font-semibold tracking-[0.12em] uppercase">
            {t("analyze.signals.macroPressure")}
          </p>
          {forecast.signals.map((signal) => (
            <SignalRow key={signal.key} signal={signal} />
          ))}
        </div>

        <div className="flex flex-col gap-2.5">
          {forecast.rationale.map((line, index) => (
            <p
              key={line}
              className={`text-[12.5px] leading-relaxed ${
                index === 0 ? "text-fg font-semibold" : "text-fg-2"
              }`}
            >
              {line}
            </p>
          ))}

          {selected && (
            <div className="mt-auto pt-2">
              <div className="mb-1 flex items-center justify-between text-[10.5px] font-semibold tracking-wider uppercase">
                <span className="text-fg-3">
                  {t("analyze.stats.confidence")}
                </span>
                <span className="text-fg-2 num tabular-nums">
                  {formatPercent(locale, selected.confidence * 100, 0)}
                </span>
              </div>
              <Progress
                percent={Math.round(selected.confidence * 100)}
                showInfo={false}
                size="small"
                strokeColor="var(--brand)"
                trailColor="var(--surface-3)"
              />
              <p className="text-fg-3 mt-2 text-[11px] leading-relaxed">
                {t(`analyze.horizonNote.${selected.horizon}` as TranslationKey)}
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function Cell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="border-line bg-surface-2/60 rounded-[14px] border px-3.5 py-2.5">
      <p className="text-fg-3 text-[10px] font-semibold tracking-[0.12em] uppercase">
        {label}
      </p>
      <p
        className="num mt-1 truncate text-[15px] leading-tight font-extrabold tabular-nums"
        style={{ color: accent }}
      >
        {value}
      </p>
    </div>
  );
}

export function AnalysisAlerts({
  error,
  stale,
  coverage,
  updatedAt,
  unavailable,
}: {
  error: string | null;
  stale: boolean;
  coverage: number;
  updatedAt: number | null;
  unavailable: string[];
}) {
  const { locale, t } = useI18n();

  const message = useMemo(() => {
    if (error) return t("analyze.errors.newsFailed");
    if (stale) return t("nerkh.staleWarning");
    if (coverage < 0.5) return t("analyze.errors.newsFailed");
    return null;
  }, [coverage, error, stale, t]);

  if (!message) return null;

  return (
    <Alert
      type={error || coverage < 0.5 ? "warning" : "info"}
      showIcon
      message={message}
      description={
        <div className="flex flex-col gap-1">
          {error && (
            <p dir="ltr" className="text-[11.5px]">
              {error}
            </p>
          )}
          {unavailable.length > 0 && (
            <p dir="ltr" className="text-[11.5px]">
              {t("analyze.sourcesTitle")}: {unavailable.join(", ")}
            </p>
          )}
          {updatedAt && (
            <p className="text-[11.5px]">{formatRelative(locale, updatedAt)}</p>
          )}
        </div>
      }
    />
  );
}
