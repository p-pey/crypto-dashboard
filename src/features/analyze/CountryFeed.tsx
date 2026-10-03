"use client";

import { Empty, Skeleton } from "antd";
import { Dot, Panel, toneForSign, type Tone } from "~/components/ui";
import { NEWS_SOURCE_LABEL_KEYS } from "~/constants/newsLabels";
import { formatRelative, formatSigned } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type { NewsArticle, NewsStance } from "~/services/news/news.types";

const STANCE_TONE: Record<NewsStance, Tone> = {
  risk_on: "up",
  risk_off: "down",
  neutral: "muted",
};

/**
 * The country's headlines, reduced to what is worth a glance.
 *
 * No summaries, no snippets, no aspect tags — the headline, the outlet, the
 * age, and the two scores. The charts above already say what the day's news is
 * about; this list is only for reading the ones that carry the most weight.
 */
export default function CountryFeed({
  articles,
  loading,
}: {
  articles: NewsArticle[];
  loading: boolean;
}) {
  const { locale, t } = useI18n();

  return (
    <Panel
      title={t("economy.topNews")}
      action={
        <span className="text-fg-3 num text-[11px] tabular-nums">
          {articles.length}
        </span>
      }
    >
      {loading && articles.length === 0 && (
        <Skeleton active paragraph={{ rows: 5 }} title={false} />
      )}

      {!loading && articles.length === 0 && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t("economy.empty")}
        />
      )}

      <ul className="-mx-1 flex flex-col divide-y divide-[var(--border)]">
        {articles.map((article) => {
          const stanceTone = STANCE_TONE[article.stance];
          const pressureTone = toneForSign(article.sentiment * 100, 5);
          return (
            <li key={article.id} className="px-1 py-2.5">
              <div className="flex items-start gap-2.5">
                <Dot tone={stanceTone} />

                <div className="min-w-0 flex-1">
                  <a
                    href={article.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-fg block text-[12.5px] leading-snug font-semibold no-underline transition-opacity hover:opacity-80"
                  >
                    {article.title}
                  </a>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <span className="text-fg-3 text-[10px] font-semibold">
                      {t(NEWS_SOURCE_LABEL_KEYS[article.source])}
                    </span>
                    <span className="text-fg-3 text-[10px]">
                      {formatRelative(locale, article.publishedAt)}
                    </span>
                    <span
                      dir="ltr"
                      className="num text-[10px] font-bold tabular-nums"
                      style={{
                        color: `var(--${stanceTone === "up" ? "mint" : stanceTone === "down" ? "rose" : "text-3"})`,
                      }}
                    >
                      {formatSigned(locale, article.riskScore, 0)} R
                    </span>
                    <span
                      dir="ltr"
                      className="num text-[10px] font-bold tabular-nums"
                      style={{
                        color:
                          pressureTone === "up"
                            ? "var(--up)"
                            : pressureTone === "down"
                              ? "var(--down)"
                              : "var(--text-3)",
                      }}
                    >
                      {formatSigned(locale, article.sentiment * 100, 0)} P
                    </span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
