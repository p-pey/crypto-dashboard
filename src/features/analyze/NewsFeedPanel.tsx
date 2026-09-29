"use client";

import { Empty, Segmented, Tag, Tooltip } from "antd";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import type { TranslationKey } from "~/i18n/dictionaries/types";
import { formatRelative, formatSigned } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type {
  NewsAspect,
  NewsArticle,
  NewsStance,
} from "~/services/news/news.types";
import { api } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

const ASPECT_COLOR: Record<NewsAspect, string> = {
  fx: "var(--cyan)",
  gold: "var(--amber)",
  oil: "var(--rose)",
  inflation: "var(--down)",
  monetary: "var(--brand-2)",
  sanctions: "var(--rose)",
  budget: "var(--text-2)",
  war: "var(--rose)",
  politics: "var(--text-2)",
  credit: "var(--rose)",
  equities: "var(--mint)",
  crypto: "var(--brand-2)",
};

const STANCE_COLOR: Record<NewsStance, string> = {
  risk_on: "var(--mint)",
  risk_off: "var(--rose)",
  neutral: "var(--text-3)",
};

const ASPECT_KEYS: Record<NewsAspect, TranslationKey> = {
  fx: "news.aspect.fx",
  gold: "news.aspect.gold",
  oil: "news.aspect.oil",
  inflation: "news.aspect.inflation",
  monetary: "news.aspect.monetary",
  sanctions: "news.aspect.sanctions",
  budget: "news.aspect.budget",
  war: "news.aspect.war",
  politics: "news.aspect.politics",
  credit: "news.aspect.credit",
  equities: "news.aspect.equities",
  crypto: "news.aspect.crypto",
};

const STANCE_KEYS: Record<NewsStance, TranslationKey> = {
  risk_on: "news.stance.risk_on",
  risk_off: "news.stance.risk_off",
  neutral: "news.stance.neutral",
};

/** `aspect ↑ rial weaker`, assembled client side so it is never English-only. */
const RESULT_KEYS = {
  up: "news.result.rialUp",
  down: "news.result.rialDown",
  flat: "news.result.rialFlat",
} as const;

type Tier = "all" | "iran" | "usOfficial" | "usWires" | "regional";

const TIERS: Tier[] = ["all", "iran", "usOfficial", "usWires", "regional"];

/**
 * The news intelligence panel.
 *
 * Every headline carries three separate readings rather than one "sentiment"
 * number: what it is about, what it does to the rial, and what it does to
 * global risk appetite. Collapsing those into a single score is what makes most
 * news dashboards unreadable — a Fed rate cut is risk-on *and* rial-negative,
 * and showing only one of the two misleads in both directions.
 */
export default function NewsFeedPanel() {
  const { locale, t } = useI18n();
  const [tier, setTier] = useState<Tier>("all");

  const { data, isLoading, isError, error, dataUpdatedAt } =
    api.macro.headlines.useQuery(
      { limit: 80 },
      {
        staleTime: 120_000,
        // The crawler caches for five minutes server side.
        refetchInterval: 120_000,
      },
    );

  const articles = useMemo(() => {
    const all = data?.articles ?? [];
    return tier === "all" ? all : all.filter((a) => a.tier === tier);
  }, [data, tier]);

  const stanceCounts = useMemo(() => {
    const counts: Record<NewsStance, number> = {
      risk_on: 0,
      risk_off: 0,
      neutral: 0,
    };
    for (const a of data?.articles ?? []) counts[a.stance] += 1;
    return counts;
  }, [data]);

  const sourceLabel = useMemo(() => {
    const map = new Map<string, TranslationKey>();
    for (const status of data?.sources ?? []) {
      map.set(status.source, `news.source.${status.source}` as TranslationKey);
    }
    return map;
  }, [data]);

  const total = data?.articles.length ?? 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="panel px-5 py-5"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-fg text-[15px] font-bold tracking-tight">
            {t("news.panel.title")}
          </h3>
          <p className="text-fg-3 mt-0.5 max-w-2xl text-[12px]">
            {t("news.panel.subtitle")}
          </p>
        </div>
        {dataUpdatedAt && (
          <span className="text-fg-3 text-[11px] font-medium">
            {formatRelative(locale, dataUpdatedAt)} ·{" "}
            {t(
              "news.panel.sourceCount",
              data?.sources.filter((s) => s.ok).length ?? 0,
              data?.sources.length ?? 0,
            )}
          </span>
        )}
      </header>

      {/* Two gauges: global risk appetite and rial pressure, kept separate. */}
      <div className="mb-4 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <Gauge
          label={t("news.panel.riskGauge")}
          value={data?.riskAggregate ?? 0}
          positiveLabel={t("news.panel.riskOn")}
          negativeLabel={t("news.panel.riskOff")}
          positiveColor="var(--mint)"
          negativeColor="var(--rose)"
          countsLabel={{
            on: stanceCounts.risk_on,
            off: stanceCounts.risk_off,
            flat: stanceCounts.neutral,
          }}
        />
        <Gauge
          label={t("news.panel.rialGauge")}
          value={data?.aggregate ?? 0}
          positiveLabel={t("news.panel.rialWeaker")}
          negativeLabel={t("news.panel.rialStronger")}
          positiveColor="var(--down)"
          negativeColor="var(--up)"
          countsLabel={{
            on: data?.articles.filter((a) => a.sentiment > 0.05).length ?? 0,
            off: data?.articles.filter((a) => a.sentiment < -0.05).length ?? 0,
            flat:
              data?.articles.filter((a) => Math.abs(a.sentiment) <= 0.05)
                .length ?? 0,
          }}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented<Tier>
          value={tier}
          onChange={setTier}
          options={TIERS.map((value) => ({
            value,
            label:
              value === "all"
                ? t("news.panel.allTiers")
                : t(`news.tier.${value}` as TranslationKey),
          }))}
        />
        {data && (
          <span className="text-fg-3 num text-[11px] tabular-nums">
            {articles.length} / {total} {t("common.articles")}
          </span>
        )}
      </div>

      {isError && (
        <p className="text-down text-[12.5px]">
          {error instanceof Error
            ? error.message
            : t("analyze.errors.newsFailed")}
        </p>
      )}

      {isLoading && !data && (
        <div className="flex flex-col gap-2" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="bg-surface-3 h-14 animate-pulse rounded-lg"
            />
          ))}
        </div>
      )}

      {!isLoading && articles.length === 0 && !isError && (
        <Empty description={t("news.panel.empty")} />
      )}

      <ul className="-mx-1 flex flex-col divide-y divide-[var(--border)]">
        {articles.map((article) => (
          <NewsRow
            key={article.id}
            article={article}
            sourceLabel={sourceLabel.get(article.source) ?? "common.source"}
          />
        ))}
      </ul>
    </motion.section>
  );
}

/**
 * A signed gauge: a centre-zero bar with the two ends labelled, plus the
 * headline count on each side of the split.
 */
function Gauge({
  label,
  value,
  positiveLabel,
  negativeLabel,
  positiveColor,
  negativeColor,
  countsLabel,
}: {
  label: string;
  value: number;
  positiveLabel: string;
  negativeLabel: string;
  positiveColor: string;
  negativeColor: string;
  countsLabel: { on: number; off: number; flat: number };
}) {
  const { locale } = useI18n();
  const magnitude = Math.min(50, Math.abs(value) / 2);
  const positive = value >= 0;
  const flat = Math.abs(value) < 3;

  return (
    <div className="border-line bg-surface-2/50 rounded-[14px] border px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-fg-3 text-[10.5px] font-semibold tracking-[0.12em] uppercase">
          {label}
        </span>
        <span
          dir="ltr"
          className="num text-[15px] font-extrabold tabular-nums"
          style={{
            color: flat
              ? "var(--text-2)"
              : positive
                ? positiveColor
                : negativeColor,
          }}
        >
          {flat ? "0" : formatSigned(locale, value, 0)}
        </span>
      </div>

      <div className="bg-surface-3 relative h-2.5 w-full overflow-hidden rounded-full">
        <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--border-strong)]" />
        <span
          className="absolute inset-y-0 rounded-full transition-all duration-700"
          style={{
            width: `${magnitude}%`,
            insetInlineStart: positive ? "50%" : undefined,
            insetInlineEnd: positive ? undefined : "50%",
            background: positive ? positiveColor : negativeColor,
          }}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10.5px]">
        <span style={{ color: negativeColor }}>{negativeLabel}</span>
        <span className="text-fg-3">
          {countsLabel.off} · {countsLabel.flat} · {countsLabel.on}
        </span>
        <span style={{ color: positiveColor }}>{positiveLabel}</span>
      </div>
    </div>
  );
}

function NewsRow({
  article,
  sourceLabel,
}: {
  article: NewsArticle;
  sourceLabel: TranslationKey;
}) {
  const { locale, t } = useI18n();
  const stanceColor = STANCE_COLOR[article.stance];
  const aspectColor: string | undefined = article.aspect
    ? ASPECT_COLOR[article.aspect]
    : undefined;

  return (
    <li className="px-1 py-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-1.5 size-2 shrink-0 rounded-full"
          style={{ background: stanceColor }}
        />

        <div className="min-w-0 flex-1">
          <a
            href={article.link}
            target="_blank"
            rel="noreferrer"
            className="text-fg block text-[13px] leading-snug font-semibold no-underline transition-opacity hover:opacity-80"
          >
            {article.title}
          </a>

          {/* What it is about, and what it does. The two are separate reads. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {article.aspect && (
              <Tag
                style={{
                  marginInlineEnd: 0,
                  color: aspectColor,
                  background:
                    "color-mix(in srgb, currentColor 12%, transparent)",
                  fontWeight: 700,
                }}
              >
                {t(ASPECT_KEYS[article.aspect])}
              </Tag>
            )}

            {article.result && (
              <span className="text-fg-2 text-[11px] font-medium">
                {article.result === "up"
                  ? "\u2191"
                  : article.result === "down"
                    ? "\u2193"
                    : "\u2192"}{" "}
                {t(RESULT_KEYS[article.result])}
              </span>
            )}

            {!article.aspect && (
              <span className="text-fg-3 text-[11px]">
                {t("news.result.noAspect")}
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Tooltip title={t(`news.tier.${article.tier}` as TranslationKey)}>
              <span className="text-fg-2 text-[10.5px] font-semibold">
                {t(sourceLabel)}
              </span>
            </Tooltip>
            <span className="text-fg-3 text-[10.5px]">
              {formatRelative(locale, article.publishedAt)}
            </span>

            <span
              dir="ltr"
              className="num text-[10.5px] font-bold tabular-nums"
              style={{ color: stanceColor }}
            >
              {t(STANCE_KEYS[article.stance])}{" "}
              {formatSigned(locale, article.riskScore, 0)}
            </span>

            <span
              dir="ltr"
              className="num text-[10.5px] font-bold tabular-nums"
              style={{
                color:
                  Math.abs(article.sentiment) < 0.05
                    ? "var(--text-3)"
                    : article.sentiment > 0
                      ? "var(--down)"
                      : "var(--up)",
              }}
            >
              IRT {formatSigned(locale, article.sentiment * 100, 0)}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
