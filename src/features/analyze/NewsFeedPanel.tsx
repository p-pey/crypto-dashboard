"use client";

import { Empty, Segmented, Tag, Tooltip } from "antd";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import type { TranslationKey } from "~/i18n/dictionaries/types";
import { formatRelative, formatSigned } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type { NewsCategory, NewsSourceId } from "~/constants/newsSources";
import type { MacroDriverId, NewsArticle } from "~/services/news/news.types";
import { api } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

const CATEGORY_KEYS: Record<NewsCategory, TranslationKey> = {
  macro: "news.macro",
  markets: "news.markets",
  politics: "news.politics",
  other: "news.other",
};

const DRIVER_KEYS: Record<MacroDriverId, TranslationKey> = {
  fx_market: "analyze.drivers.fxMarket",
  inflation: "analyze.drivers.inflation",
  monetary: "analyze.drivers.monetary",
  sanctions: "analyze.drivers.sanctions",
  oil_energy: "analyze.drivers.oilEnergy",
  budget: "analyze.drivers.budget",
  gold_demand: "analyze.drivers.goldDemand",
  political_risk: "analyze.drivers.politicalRisk",
};

const CATEGORY_COLOR: Record<NewsCategory, string> = {
  macro: "var(--brand-2)",
  markets: "var(--cyan)",
  politics: "var(--amber)",
  other: "var(--text-3)",
};

type Filter = NewsCategory | "all";

export default function NewsFeedPanel() {
  const { locale, t } = useI18n();
  const [filter, setFilter] = useState<Filter>("all");

  const { data, isLoading, isError, error } = api.macro.headlines.useQuery(
    { limit: 60 },
    {
      staleTime: 120_000,
      // The crawler caches for five minutes server side, so a slow poll is
      // enough to pick up a new batch of headlines.
      refetchInterval: 180_000,
    },
  );

  const articles = useMemo(() => {
    const all = data?.articles ?? [];
    return filter === "all" ? all : all.filter((a) => a.category === filter);
  }, [data, filter]);

  const sourceLabel = useMemo(() => {
    const map = new Map<NewsSourceId, TranslationKey>();
    for (const status of data?.sources ?? []) {
      // The dictionary keys mirror the source ids, so the lookup is direct.
      map.set(status.source, `news.source.${status.source}` as TranslationKey);
    }
    return map;
  }, [data]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="panel flex flex-col px-5 py-5"
      >
        <header className="mb-4">
          <h3 className="text-fg text-[15px] font-bold tracking-tight">
            {t("analyze.newsTitle")}
          </h3>
          <p className="text-fg-3 mt-0.5 text-[12px]">
            {t("analyze.newsSubtitle")} · {t("analyze.newsSentimentScale")}
          </p>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: t("common.all") },
              { value: "macro", label: t(CATEGORY_KEYS.macro) },
              { value: "markets", label: t(CATEGORY_KEYS.markets) },
              {
                value: "politics",
                label: t(CATEGORY_KEYS.politics),
              },
            ]}
          />
          {data && (
            <span className="text-fg-3 num text-[11px] tabular-nums">
              {data.total} {t("common.articles")}
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
                className="bg-surface-3 h-9 animate-pulse rounded-lg"
              />
            ))}
          </div>
        )}

        {!isLoading && articles.length === 0 && !isError && (
          <Empty description={t("analyze.newsEmpty")} />
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

      <motion.aside
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.06, ease: EASE }}
        className="panel flex flex-col gap-4 px-5 py-5"
      >
        <header>
          <h3 className="text-fg text-[15px] font-bold tracking-tight">
            {t("analyze.sourcesTitle")}
          </h3>
          <p className="text-fg-3 mt-0.5 text-[12px]">
            {t("common.sourcesOk")}: {Math.round((data?.coverage ?? 0) * 100)}
            {t("common.percent")}
          </p>
        </header>

        <div className="flex flex-col gap-2.5">
          {(data?.drivers ?? []).map((driver) => (
            <div key={driver.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`text-[12px] font-semibold ${
                    driver.available ? "text-fg-2" : "text-fg-3"
                  }`}
                >
                  {t(DRIVER_KEYS[driver.id])}
                </span>
                <span
                  dir="ltr"
                  className="num text-[12px] font-bold tabular-nums"
                  style={{
                    color: !driver.available
                      ? "var(--text-3)"
                      : driver.score > 2
                        ? "var(--down)"
                        : driver.score < -2
                          ? "var(--up)"
                          : "var(--text-2)",
                  }}
                >
                  {driver.available
                    ? formatSigned(locale, driver.score, 0)
                    : "—"}
                </span>
              </div>
              <div className="bg-surface-3 relative h-1.5 w-full overflow-hidden rounded-full">
                {driver.available && (
                  <span
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      width: `${Math.min(50, Math.abs(driver.score) / 2)}%`,
                      insetInlineStart: driver.score >= 0 ? "50%" : undefined,
                      insetInlineEnd: driver.score < 0 ? "50%" : undefined,
                      background:
                        driver.score >= 0 ? "var(--down)" : "var(--up)",
                    }}
                  />
                )}
                <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--border-strong)]" />
              </div>
              <p className="text-fg-3 text-[10.5px]">{driver.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-auto flex flex-col gap-1.5 border-t border-[var(--border)] pt-3">
          {(data?.sources ?? []).map((status) => (
            <div
              key={status.source}
              className="flex items-center justify-between gap-2 text-[11.5px]"
            >
              <span className="text-fg-2 font-semibold">
                {t(sourceLabel.get(status.source) ?? "common.source")}
              </span>
              <Tooltip title={status.error ?? undefined}>
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{ color: status.ok ? "var(--mint)" : "var(--rose)" }}
                >
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{
                      background: status.ok ? "var(--mint)" : "var(--rose)",
                    }}
                  />
                  <span className="num tabular-nums">
                    {status.ok ? `${status.count}` : t("common.unavailable")}
                  </span>
                </span>
              </Tooltip>
            </div>
          ))}
        </div>
      </motion.aside>
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

  return (
    <li className="px-1 py-2.5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-1.5 size-1.5 shrink-0 rounded-full"
          style={{ background: CATEGORY_COLOR[article.category] }}
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

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-fg-3 text-[10.5px] font-semibold">
              {t(sourceLabel)}
            </span>
            <span className="text-fg-3 text-[10.5px]">
              {formatRelative(locale, article.publishedAt)}
            </span>
            <Tag
              color={
                article.sentiment > 0.1
                  ? "red"
                  : article.sentiment < -0.1
                    ? "green"
                    : "default"
              }
              style={{ marginInlineEnd: 0, fontSize: 10, lineHeight: "16px" }}
            >
              {formatSigned(locale, article.sentiment * 100, 0)}
            </Tag>
          </div>
        </div>
      </div>
    </li>
  );
}
