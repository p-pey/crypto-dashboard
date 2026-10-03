"use client";

import { Alert, Button, Skeleton, Tooltip } from "antd";
import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { Meter, type Tone } from "~/components/ui";
import type { CountryId } from "~/constants/countries";
import type { AiProviderId } from "~/services/ai/providerId";
import type { Horizon, TranslationKey } from "~/i18n/dictionaries/types";
import { formatNumber, formatSignedPercent } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type {
  AnalyzeAiHorizon,
  AnalyzeAiVerdict,
} from "~/services/macro/analyzeAi.types";
import { api } from "~/trpc/react";
import { factorKey } from "./factorLabels";

const EASE = [0.16, 1, 0.3, 1] as const;

/** The three direction odds the panel renders as one stacked bar. */
type Odds = { up: number; flat: number; down: number };

const VERDICT_COLOR: Record<AnalyzeAiVerdict, string> = {
  bullish: "var(--up)",
  bearish: "var(--down)",
  neutral: "var(--text-2)",
};

const VERDICT_KEYS: Record<AnalyzeAiVerdict, TranslationKey> = {
  bullish: "analyze.verdict.bullish",
  bearish: "analyze.verdict.bearish",
  neutral: "analyze.verdict.neutral",
};

/** Odds bar: three fixed segments so the distribution reads without a legend. */
function OddsBar({ probabilities }: { probabilities: Odds }) {
  const { t } = useI18n();
  const segments = [
    {
      label: t("localAi.oddsUp"),
      value: probabilities.up,
      color: "var(--rose)",
    },
    {
      label: t("localAi.oddsFlat"),
      value: probabilities.flat,
      color: "var(--text-3)",
    },
    {
      label: t("localAi.oddsDown"),
      value: probabilities.down,
      color: "var(--up)",
    },
  ];
  const sum = Math.max(
    1,
    segments.reduce((acc, s) => acc + s.value, 0),
  );

  return (
    <div>
      <div className="bg-surface-3 flex h-6 w-full overflow-hidden rounded-lg">
        {segments.map((segment) => (
          <Tooltip
            key={segment.label}
            title={`${segment.label} ${segment.value}%`}
          >
            <div
              className="flex items-center justify-center transition-all duration-500"
              style={{
                width: `${(segment.value / sum) * 100}%`,
                background: segment.color,
                opacity: 0.85,
              }}
            >
              {segment.value >= 12 && (
                <span className="num text-[10px] font-bold text-[var(--surface)] tabular-nums">
                  {segment.value}%
                </span>
              )}
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] font-semibold">
        {segments.map((segment) => (
          <span key={segment.label} style={{ color: segment.color }}>
            {segment.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const SPAN_KEY: Record<string, TranslationKey> = {
  d1: "localAi.span24h",
  w1: "localAi.span7d",
  m1: "localAi.span30d",
};

/**
 * The model's forward curve: expected drift for the dollar and for gold at
 * three spans.
 *
 * Two bars per span around a centre zero, because both can be negative and the
 * direction is the whole point — a chart that could only show magnitude would
 * read a falling rial as a rising one.
 */
function ForwardCurve({ horizons }: { horizons: AnalyzeAiHorizon[] }) {
  const { locale, t } = useI18n();
  const peak = Math.max(
    1,
    ...horizons.flatMap((h) => [
      Math.abs(h.usdDriftPercent),
      Math.abs(h.goldDriftPercent),
    ]),
  );

  return (
    <div className="flex flex-col gap-2">
      {horizons.map((horizon) => (
        <div
          key={horizon.span}
          className="grid grid-cols-[38px_1fr_52px] items-center gap-2"
        >
          <span className="text-fg-3 text-[10px] font-bold uppercase">
            {t(SPAN_KEY[horizon.span] ?? "localAi.span24h")}
          </span>

          <div className="flex flex-col gap-1">
            <Meter
              value={horizon.usdDriftPercent}
              max={peak}
              tone="amber"
              height={8}
            />
            <Meter
              value={horizon.goldDriftPercent}
              max={peak}
              tone="brand"
              height={8}
            />
          </div>

          <span
            dir="ltr"
            className="num text-fg-3 text-end text-[10px] font-semibold tabular-nums"
          >
            {formatNumber(locale, horizon.confidence, {
              maximumFractionDigits: 0,
            })}
            %
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The model panel.
 *
 * Every registered runtime is listed with its state, because the choice is
 * real: a free cloud key answers in seconds where a local 9B on CPU takes
 * minutes, and a user with both should be able to say so rather than discover it.
 *
 * Unpicked, the app follows its own order — a local runtime while one is
 * loaded, otherwise the first configured cloud key — and the panel marks which
 * one that currently is.
 */
export default function LocalAiPanel({
  country,
  countryLabel,
  horizon,
  horizonLabel,
}: {
  country: CountryId;
  countryLabel: string;
  horizon: Horizon;
  horizonLabel: string;
}) {
  const { locale, t } = useI18n();
  const [raw, setRaw] = useState<string | null>(null);
  // Null means "follow the app's preference order".
  const [picked, setPicked] = useState<AiProviderId | null>(null);
  // Bumped by the re-check button. It rides in the query input rather than
  // being read imperatively, so the re-check is a real cache key instead of a
  // refetch the server would answer from its own cache.
  const [recheck, setRecheck] = useState(0);

  const status = api.llm.status.useQuery(
    { force: recheck > 0 },
    {
      staleTime: 30_000,
      refetchInterval: 60_000,
      retry: false,
    },
  );

  const utils = api.useUtils();
  const run = api.llm.analyze.useMutation({
    onSuccess: (result) => {
      setRaw(result.raw);
      void utils.llm.status.invalidate();
    },
  });

  const onRun = useCallback(() => {
    run.mutate({
      country,
      horizon,
      countryLabel,
      horizonLabel,
      ...(picked ? { providerId: picked } : {}),
    });
  }, [country, countryLabel, horizon, horizonLabel, picked, run]);

  // The registry reports every runtime; the panel shows the one that will
  // actually serve this request, so a configured-but-not-running cloud key
  // never makes the button look dead while a local model is answering.
  // The runtime this request will actually use: the explicit pick when there is
  // one, otherwise whatever the registry chose.
  const active = status.data?.statuses.find(
    (entry) => entry.provider === (picked ?? status.data?.active),
  );
  const online = active?.online ?? false;
  const providers = status.data?.statuses ?? [];
  const analysis = run.data?.analysis ?? null;
  const error = run.data?.error ?? (online ? null : (active?.error ?? null));

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="panel px-5 py-5"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-fg text-[13px] font-bold">
            {t("localAi.title")}
          </h3>
          <p className="text-fg-3 mt-0.5 max-w-xl text-[10.5px] leading-relaxed">
            {t("localAi.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className="flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[10px] font-bold"
            style={{
              color: online ? "var(--mint)" : "var(--text-3)",
              background: online
                ? "color-mix(in srgb, var(--mint) 12%, transparent)"
                : "var(--surface-3)",
            }}
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: online ? "var(--mint)" : "var(--text-3)" }}
            />
            {status.isLoading
              ? t("localAi.checking")
              : online
                ? t("localAi.online")
                : t("localAi.offline")}
          </span>

          {online && active?.model && (
            <span className="mono text-fg-3 text-[10px]">
              {active.label} · {active.model}
            </span>
          )}

          {providers.length > 1 && (
            <select
              dir="ltr"
              value={picked ?? ""}
              onChange={(event) =>
                setPicked((event.target.value || null) as AiProviderId | null)
              }
              aria-label={t("localAi.provider")}
              className="border-line bg-surface-2 text-fg-2 rounded-md border px-2 py-1 text-[11px] font-semibold"
            >
              <option value="">{t("localAi.auto")}</option>
              {providers.map((entry) => (
                <option key={entry.provider} value={entry.provider}>
                  {entry.label}
                  {entry.online ? ` · ${entry.model ?? ""}` : ""}
                </option>
              ))}
            </select>
          )}

          <Button
            size="small"
            type="primary"
            loading={run.isPending}
            disabled={!online}
            onClick={onRun}
          >
            {run.isPending
              ? t("localAi.running")
              : analysis
                ? t("localAi.rerun")
                : t("localAi.run")}
          </Button>

          {!status.isLoading && !online && (
            <Button size="small" onClick={() => setRecheck((n) => n + 1)}>
              {t("localAi.recheck")}
            </Button>
          )}
        </div>
      </header>

      {!online && !status.isLoading && (
        <Alert
          type="info"
          showIcon
          message={t("localAi.setup")}
          description={active?.label ?? null}
        />
      )}

      {online && !analysis && !run.isPending && (
        <div className="border-line bg-surface-2/40 rounded-[14px] border px-4 py-6 text-center">
          <p className="text-fg-3 text-[11.5px]">{t("localAi.note")}</p>
        </div>
      )}

      {run.isPending && (
        <div className="border-line bg-surface-2/40 rounded-[14px] border px-4 py-4">
          <Skeleton active paragraph={{ rows: 3 }} title={false} />
        </div>
      )}

      {analysis && !run.isPending && (
        <div className="flex flex-col gap-4">
          {/* Verdict, confidence and the two drift figures, in one row. */}
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Figure
              label={t("localAi.verdict")}
              value={t(VERDICT_KEYS[analysis.verdict])}
              color={VERDICT_COLOR[analysis.verdict]}
            />
            <Figure
              label={t("localAi.confidence")}
              value={`${formatNumber(locale, analysis.confidence, { maximumFractionDigits: 0 })}%`}
              color="var(--brand-2)"
              meter={analysis.confidence}
            />
            <Figure
              label={`${t("localAi.drift")} · ${t("analyze.asset.usd")}`}
              value={formatSignedPercent(locale, analysis.usdDriftPercent, 1)}
              color={
                analysis.usdDriftPercent >= 0 ? "var(--down)" : "var(--up)"
              }
            />
            <Figure
              label={`${t("localAi.drift")} · ${t("analyze.asset.gold")}`}
              value={formatSignedPercent(locale, analysis.goldDriftPercent, 1)}
              color={
                analysis.goldDriftPercent >= 0 ? "var(--down)" : "var(--up)"
              }
            />
          </div>

          <p className="text-fg text-[12.5px] leading-relaxed font-semibold">
            {analysis.summary}
          </p>

          {analysis.reasoning && (
            <p className="text-fg-2 text-[12px] leading-relaxed">
              {analysis.reasoning}
            </p>
          )}

          <div>
            <p className="text-fg-3 mb-1.5 text-[10px] font-bold tracking-[0.13em] uppercase">
              {t("localAi.odds")}
            </p>
            <OddsBar probabilities={analysis.probabilities} />
          </div>

          {analysis.horizons.length > 0 && (
            <div>
              <p className="text-fg-3 mb-1.5 text-[10px] font-bold tracking-[0.13em] uppercase">
                {t("localAi.forwardCurve")}
              </p>
              <ForwardCurve horizons={analysis.horizons} />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-fg-3 mb-2 text-[10px] font-bold tracking-[0.13em] uppercase">
                {t("localAi.factors")}
              </p>
              <ul className="flex flex-col gap-2">
                {analysis.factors.map((factor, index) => {
                  const key = factorKey(factor.aspect);
                  const color =
                    Math.abs(factor.impact) < 3
                      ? "var(--text-3)"
                      : factor.impact > 0
                        ? "var(--down)"
                        : "var(--up)";
                  return (
                    <li key={`${factor.aspect}-${index}`}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-fg-2 truncate text-[11.5px] font-semibold">
                          {key ? t(key) : factor.aspect}
                        </span>
                        <span
                          dir="ltr"
                          className="num text-[11px] font-bold tabular-nums"
                          style={{ color }}
                        >
                          {factor.impact > 0 ? "+" : ""}
                          {Math.round(factor.impact)}
                        </span>
                      </div>
                      <div className="bg-surface-3 relative mt-1 h-1.5 w-full overflow-hidden rounded-full">
                        <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--border-strong)]" />
                        <span
                          className="absolute inset-y-0 rounded-full"
                          style={{
                            width: `${Math.min(50, (Math.abs(factor.impact) / 100) * 50)}%`,
                            insetInlineStart:
                              factor.impact >= 0 ? "50%" : undefined,
                            insetInlineEnd:
                              factor.impact >= 0 ? undefined : "50%",
                            background: color,
                          }}
                        />
                      </div>
                      {factor.note && (
                        <p className="text-fg-3 mt-0.5 truncate text-[10px]">
                          {factor.note}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <p className="text-fg-3 mb-2 text-[10px] font-bold tracking-[0.13em] uppercase">
                {t("localAi.risks")}
              </p>
              <ul className="flex flex-col gap-1.5">
                {analysis.risks.map((risk, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span aria-hidden className="text-amber mt-0.5 text-[11px]">
                      •
                    </span>
                    <span className="text-fg-2 text-[11.5px] leading-relaxed">
                      {risk}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <footer className="text-fg-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
            <span className="mono">{analysis.model}</span>
            <span className="num">
              {t(
                "localAi.answeredIn",
                formatNumber(locale, analysis.elapsedMs / 1000, {
                  maximumFractionDigits: 1,
                }),
              )}
              s
            </span>
            <span className="ml-auto">{t("localAi.note")}</span>
          </footer>
        </div>
      )}

      {error &&
        run.isError !== undefined &&
        !run.isPending &&
        !analysis &&
        online && (
          <Alert type="warning" showIcon message={error} className="mt-3" />
        )}

      {raw && (
        <details className="mt-3">
          <summary className="text-fg-3 cursor-pointer text-[10.5px] font-semibold">
            {t("localAi.rawToggle")}
          </summary>
          <pre
            dir="ltr"
            className="mono text-fg-3 mt-2 max-h-48 overflow-auto text-[10px] whitespace-pre-wrap"
          >
            {raw}
          </pre>
        </details>
      )}
    </motion.section>
  );
}

function Figure({
  label,
  value,
  color,
  tone = "brand",
  meter,
}: {
  label: string;
  value: string;
  color: string;
  tone?: Tone;
  meter?: number;
}) {
  return (
    <div className="border-line bg-surface-2/50 rounded-[14px] border px-3.5 py-2.5">
      <p className="text-fg-3 text-[9.5px] font-bold tracking-[0.13em] uppercase">
        {label}
      </p>
      <p
        dir="ltr"
        className="num mt-1 text-[16px] leading-none font-extrabold tabular-nums"
        style={{ color }}
      >
        {value}
      </p>
      {meter !== undefined && (
        <Meter
          value={meter}
          diverging={false}
          tone={tone}
          height={6}
          className="mt-2"
        />
      )}
    </div>
  );
}
