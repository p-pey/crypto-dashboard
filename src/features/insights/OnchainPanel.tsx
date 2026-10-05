"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import {
  Dot,
  Label,
  Panel,
  PanelBox,
  Pill,
  Stat,
  StatGrid,
} from "~/components/ui";
import {
  formatCompact,
  formatNumber,
  formatRelative,
  formatSignedPercent,
} from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { api, type RouterOutputs } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Chain network health, from four keyless sources.
 *
 * The board exists to make one distinction visible, which every other chain
 * widget in the app collapses: **a chain that could not be reached is not a chain
 * that is idle.** Each row therefore names the sources that answered it, and the
 * header counts unreachable chains separately from live ones — so twelve rows
 * never implies twelve working feeds.
 *
 * A second distinction matters equally: `sourceAgeSeconds` is how long ago the
 * *explorer* last refreshed, which is not the same as how long ago the chain last
 * produced a block. Blockscout publishes no block timestamp, so reading its
 * payload as live chain data is exactly the kind of stale-read-as-fresh error the
 * source field exists to prevent.
 */
export default function OnchainPanel() {
  const { locale, t } = useI18n();

  const { data, isLoading, dataUpdatedAt } = api.insights.chainNetwork.useQuery(
    {},
    { staleTime: 5 * 60_000, refetchInterval: 5 * 60_000, retry: false },
  );

  const rows = useMemo(
    () =>
      (data?.rows ?? []).slice().sort((a, b) => {
        // Live chains first, then by how much value the chain carries.
        if (a.ok !== b.ok) return a.ok ? -1 : 1;
        return (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0);
      }),
    [data?.rows],
  );

  if (isLoading && !data) {
    return (
      <Panel title={t("onchain.title")}>
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

  const summary = data?.summary;

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
            {t("onchain.title")}
          </h2>
          <p className="text-fg-3 mt-0.5 max-w-2xl text-[11px] leading-relaxed">
            {t("onchain.subtitle")}
          </p>
        </div>
        {dataUpdatedAt > 0 && (
          <span className="text-fg-3 text-[10.5px]">
            {formatRelative(locale, dataUpdatedAt)}
          </span>
        )}
      </header>

      <StatGrid min={130} className="mb-4">
        <Stat
          label={t("onchain.live")}
          value={formatNumber(locale, summary?.live ?? null)}
          hint={`${t("onchain.unreachable")}: ${formatNumber(locale, summary?.unreachable ?? null)}`}
          tone="up"
        />
        <Stat
          label={t("onchain.medianGas")}
          value={
            summary?.medianGasGwei == null
              ? "—"
              : formatNumber(locale, summary.medianGasGwei, {
                  maximumFractionDigits: 2,
                }) + " gwei"
          }
          tone="amber"
        />
        <Stat
          label={t("onchain.totalMarketCap")}
          value={formatCompact(locale, summary?.totalMarketCap)}
        />
        <Stat
          label={t("onchain.fee")}
          value={
            summary?.feeSatPerVb == null
              ? "—"
              : formatNumber(locale, summary.feeSatPerVb, {
                  maximumFractionDigits: 1,
                }) + " sat/vB"
          }
          hint={t("onchain.hashrate")}
          tone="neutral"
        />
      </StatGrid>

      {rows.length === 0 ? (
        <PanelBox>
          <p className="text-fg-3 text-[11px]">{data?.error ?? t("onchain.noData")}</p>
        </PanelBox>
      ) : (
        <div className="flex flex-col gap-1">
          {rows.map((row) => (
            <ChainRow key={row.chain} row={row} />
          ))}
        </div>
      )}
    </motion.section>
  );
}

type ChainRowData = RouterOutputs["insights"]["chainNetwork"]["rows"][number];

function ChainRow({ row }: { row: ChainRowData }) {
  const { locale, t } = useI18n();

  /**
   * A source that has not refreshed in ten minutes is reported as quiet rather
   * than live. This is the one place the panel deliberately shows a successful
   * read as *not* current, because the payload is real but its age is unknown.
   */
  const staleSource =
    row.ok &&
    row.sourceAgeSeconds !== null &&
    row.sourceAgeSeconds > 600;

  return (
    <div
      className={`flex items-center gap-3 rounded-[10px] border px-3 py-2 ${
        row.ok
          ? staleSource
            ? "border-amber/25 bg-amber/5"
            : "border-line bg-surface-2/40"
          : "border-line bg-surface-2/20"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Dot
            tone={row.ok ? (staleSource ? "amber" : "up") : "muted"}
            title={
              row.ok
                ? staleSource
                  ? t("onchain.staleSource")
                  : t("onchain.live")
                : (row.error ?? t("onchain.unreachable"))
            }
          />
          <span className="text-fg text-[12px] font-bold">{row.chain}</span>
          {row.sources.length > 0 ? (
            row.sources.map((source: string) => (
              <Pill key={source} tone="muted" size="sm">
                {source}
              </Pill>
            ))
          ) : (
            <Pill tone="muted" size="sm">
              {t("onchain.chainUnavailable")}
            </Pill>
          )}
        </div>
        {row.error && row.ok && (
          <span className="text-fg-3 ms-4 block truncate text-[10px]">
            {row.error}
          </span>
        )}
      </div>

      <Metric label={t("onchain.blockHeight")} value={formatNumber(locale, row.blockHeight)} />
      <Metric
        label={t("onchain.blockRate")}
        value={
          row.blockRate == null
            ? "—"
            : formatNumber(locale, row.blockRate, { maximumFractionDigits: 3 })
        }
      />
      <Metric label={t("onchain.tx24h")} value={formatCompact(locale, row.tx24h)} />
      <Metric
        label={t("onchain.gas")}
        value={
          row.gasGwei == null
            ? "—"
            : formatNumber(locale, row.gasGwei, { maximumFractionDigits: 2 })
        }
        tone={row.gasGwei !== null && row.gasGwei > 20 ? "amber" : undefined}
      />
      <Metric
        label={t("onchain.fee")}
        value={
          row.feeSatPerVb == null
            ? "—"
            : formatNumber(locale, row.feeSatPerVb, { maximumFractionDigits: 1 })
        }
      />
      <Metric
        label={t("onchain.hashrate")}
        value={
          row.hashrate == null
            ? "—"
            : formatCompact(locale, row.hashrate) + " H/s"
        }
      />
      <Metric
        label={t("onchain.marketCap")}
        value={formatCompact(locale, row.marketCapUsd ?? row.circulatingSupply)}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber" | "up" | "down";
}) {
  return (
    <div className="w-[74px] shrink-0 text-end">
      <Label tone={tone ?? "muted"}>{label}</Label>
      <span
        dir="ltr"
        className="num text-fg-2 block truncate text-[11.5px] font-bold tabular-nums"
      >
        {value}
      </span>
    </div>
  );
}

/** Kept for the page: the signed-change helper the chain rows do not need. */
export const chainChange = (value: number | null) => formatSignedPercent;