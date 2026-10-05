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
  toneForSign,
} from "~/components/ui";
import { formatCompact, formatNumber, formatRelative } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { api } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Sector rotation.
 *
 * Everything else in the app ranks coins against each other. This ranks
 * *groups* of coins, which answers a question no per-coin list can: is capital
 * rotating out of layer 1s into memes, or the reverse? That is a statement about
 * relative performance, and relative performance only exists between groups.
 *
 * Two figures that justify the panel:
 *
 * 1. **Ranked by change, not by size.** A sector board sorted by market cap buries
 *    a small category that is moving fast under a large one that is not, which is
 *    exactly the thing a reader is looking for.
 * 2. **Share of total cap** as a meter, so a category that is both small and fast
 *    reads differently from a large one that is merely average — the same
 *    percentage move means something different at $30B than at $300M.
 */
export default function RotationPanel() {
  const { locale, t } = useI18n();

  const { data, isLoading, dataUpdatedAt } = api.insights.categories.useQuery(
    {},
    { staleTime: 5 * 60_000, refetchInterval: 10 * 60_000, retry: false },
  );

  const totalCap = data?.totalMarketCap ?? null;

  const categories = useMemo(() => {
    const rows = data?.categories ?? [];
    return rows.filter((row) => (row.marketCap ?? 0) > 0).slice(0, 24);
  }, [data?.categories]);

  if (isLoading && !data) {
    return (
      <Panel title={t("rotation.title")}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="panel px-5 py-5"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-fg text-[13px] font-bold tracking-tight">
            {t("rotation.title")}
          </h2>
          <p className="text-fg-3 mt-0.5 max-w-2xl text-[11px] leading-relaxed">
            {t("rotation.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="muted" size="sm">
            {t("rotation.source")}
          </Pill>
          {data?.stale && (
            <Pill tone="amber" size="sm">
              {t("sourceState.stale")}
            </Pill>
          )}
          {dataUpdatedAt && (
            <span className="text-fg-3 text-[10.5px]">
              {formatRelative(locale, dataUpdatedAt)}
            </span>
          )}
        </div>
      </header>

      <StatGrid min={130} className="mb-4">
        <Stat
          label={t("rotation.marketCap")}
          value={formatCompact(locale, totalCap)}
          tone="neutral"
        />
        <Stat
          label={t("rotation.advancing")}
          value={formatNumber(locale, data?.advancing ?? null)}
          tone="up"
        />
        <Stat
          label={t("rotation.declining")}
          value={formatNumber(locale, data?.declining ?? null)}
          tone="down"
        />
        <Stat
          label={t("rotation.change24h")}
          value={
            data?.categories[0]?.change24h == null
              ? "—"
              : formatNumber(locale, data.categories[0].change24h, {
                  maximumFractionDigits: 1,
                  signDisplay: "exceptZero",
                }) + "%"
          }
          hint={data?.categories[0]?.name}
          tone={toneForSign(data?.categories[0]?.change24h, 0.05)}
        />
      </StatGrid>

      {categories.length === 0 ? (
        <p className="text-fg-3 text-[11px]">
          {data?.error ?? t("rotation.empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {categories.map((row) => {
            const change = row.change24h;
            const tone = toneForSign(change, 0.05);
            const share =
              totalCap && row.marketCap ? row.marketCap / totalCap : null;

            return (
              <div
                key={row.id}
                title={row.description ?? undefined}
                className="border-line bg-surface-2/40 hover:bg-surface-2/70 flex items-center gap-3 rounded-[10px] border px-3 py-2 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-fg truncate text-[12px] font-semibold">
                      {row.name}
                    </span>
                    {row.coinCount > 0 && (
                      <span className="text-fg-3 shrink-0 text-[10px]">
                        {formatNumber(locale, row.coinCount)} {t("rotation.coins")}
                      </span>
                    )}
                  </div>
                  {share !== null && (
                    <div className="mt-1">
                      <Meter value={share} diverging={false} tone="brand" />
                    </div>
                  )}
                </div>

                <div className="w-[92px] shrink-0 text-end">
                  <span className="text-fg-3 block text-[9.5px]">
                    {t("rotation.marketCap")}
                  </span>
                  <span className="num text-fg text-[12px] font-bold tabular-nums">
                    {formatCompact(locale, row.marketCap)}
                  </span>
                </div>

                <div className="w-[74px] shrink-0 text-end">
                  <span className="text-fg-3 block text-[9.5px]">
                    {t("rotation.volume")}
                  </span>
                  <span className="num text-fg-2 text-[12px] font-bold tabular-nums">
                    {formatCompact(locale, row.volume24h)}
                  </span>
                </div>

                <div className="w-[70px] shrink-0 text-end">
                  <Label tone={tone}>{t("rotation.change24h")}</Label>
                  <span
                    dir="ltr"
                    className="num text-[12.5px] font-extrabold tabular-nums"
                    style={{
                      color:
                        change === null
                          ? "var(--text-3)"
                          : `var(--${tone === "up" ? "up" : tone === "down" ? "down" : "text-2"})`,
                    }}
                  >
                    {change === null
                      ? "—"
                      : formatNumber(locale, change, {
                          maximumFractionDigits: 2,
                          signDisplay: "exceptZero",
                        }) + "%"}
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

/** Exported for the DeFi page, which reuses the empty state. */
export function EmptyInsight({ message }: { message: string }) {
  return (
    <PanelBox>
      <p className="text-fg-3 text-[11px]">{message}</p>
    </PanelBox>
  );
}