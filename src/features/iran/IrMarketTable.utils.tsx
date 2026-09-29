"use client";

import { Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo } from "react";
import Sparkline from "~/features/shared/Sparkline";
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL_KEYS,
  marketSource,
} from "~/constants/iranMarket";
import { formatNumber, formatPercent, formatTime } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { categoryRank } from "./iranMarket.mapper";
import type { MarketRow } from "~/services/iran/iran.market.types";
import { RIAL_PER_TOMAN } from "~/services/nerkh/nerkh.types";

export type QuoteUnit = "rial" | "toman";

/** Every price in the row model is Rial; the toggle scales on the way out. */
function unitScale(unit: QuoteUnit): number {
  return unit === "toman" ? 1 / RIAL_PER_TOMAN : 1;
}

function Price({
  value,
  scale,
  color,
  bold = false,
}: {
  value: number | null;
  scale: number;
  color?: string;
  bold?: boolean;
}) {
  const { locale } = useI18n();
  return (
    <span
      className={`num whitespace-nowrap tabular-nums ${bold ? "text-[13.5px] font-bold" : "text-[12.5px] font-semibold"}`}
      style={{
        color: value === null ? "var(--text-3)" : color,
        opacity: value === null ? 0.4 : 1,
      }}
    >
      {value === null
        ? "—"
        : formatNumber(locale, value * scale, { maximumFractionDigits: 0 })}
    </span>
  );
}

function SourceCell({ row }: { row: MarketRow }) {
  const { t } = useI18n();
  const source = marketSource(row.source);

  return (
    <a
      href={source.website}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-[12.5px] font-semibold no-underline transition-opacity hover:opacity-80"
      style={{ color: source.color }}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ background: source.color }}
      />
      <span className="whitespace-nowrap">{source.label}</span>
      {source.kind === "aggregator" && (
        <Tag style={{ marginInlineEnd: 0, fontSize: 9, lineHeight: "14px" }}>
          {t("irPrice.sourceTag.aggregator")}
        </Tag>
      )}
    </a>
  );
}

function InstrumentCell({ row }: { row: MarketRow }) {
  const { t } = useI18n();
  const name = row.upstreamName ?? t(row.labelKey);

  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-fg truncate text-[13px] font-semibold">{name}</span>
      <span dir="ltr" className="mono text-fg-3 truncate text-[10.5px]">
        {row.symbol ?? row.assetId}
      </span>
    </div>
  );
}

function ChangeCell({ row }: { row: MarketRow }) {
  const { locale, t } = useI18n();
  const value = row.changePercent;

  if (value === null) {
    return <span className="text-fg-3 text-[12px]">—</span>;
  }

  const flat = Math.abs(value) < 0.005;
  const window =
    row.changeWindowHours === null
      ? t("irPrice.table.observed")
      : row.changeWindowHours === 24
        ? t("irPrice.table.window24h")
        : t("irPrice.table.window12h");

  return (
    <Tooltip title={window}>
      <span
        className="num text-[12.5px] font-semibold whitespace-nowrap tabular-nums"
        style={{
          color: flat
            ? "var(--text-2)"
            : value > 0
              ? "var(--up)"
              : "var(--down)",
        }}
      >
        {formatPercent(locale, value, 2)}
      </span>
    </Tooltip>
  );
}

function StatusCell({ row }: { row: MarketRow }) {
  const { locale, t } = useI18n();

  const color =
    row.status === "live"
      ? "var(--mint)"
      : row.status === "stale"
        ? "var(--amber)"
        : "var(--rose)";

  const label =
    row.status === "live"
      ? t("common.live")
      : row.status === "stale"
        ? t("common.stale")
        : t("common.error");

  const title =
    row.error ??
    (row.updatedAt
      ? t("irPrice.table.lastUpdate", formatTime(locale, row.updatedAt))
      : t("irPrice.table.noUpdateYet"));

  return (
    <Tooltip title={title}>
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className={`size-1.5 shrink-0 rounded-full ${row.live ? "animate-pulse" : ""}`}
          style={{ background: color }}
        />
        <span
          className="text-[11.5px] font-semibold whitespace-nowrap"
          style={{ color }}
        >
          {row.live ? t("irPrice.table.stream") : label}
        </span>
      </span>
    </Tooltip>
  );
}

export function useMarketColumns(unit: QuoteUnit): ColumnsType<MarketRow> {
  const { t } = useI18n();
  const scale = unitScale(unit);

  return useMemo<ColumnsType<MarketRow>>(
    () => [
      {
        title: t("irPrice.table.category"),
        dataIndex: "category",
        key: "category",
        width: 118,
        fixed: "start",
        sorter: (a, b) => categoryRank(a.category) - categoryRank(b.category),
        defaultSortOrder: "ascend",
        render: (_value, row) => (
          <span
            className="rounded-full px-2 py-[3px] text-[10.5px] font-bold tracking-[0.06em] uppercase"
            style={{
              color: CATEGORY_COLOR[row.category],
              background: "color-mix(in srgb, currentColor 14%, transparent)",
            }}
          >
            {t(CATEGORY_LABEL_KEYS[row.category])}
          </span>
        ),
      },
      {
        title: t("irPrice.table.source"),
        dataIndex: "source",
        key: "source",
        width: 140,
        fixed: "start",
        render: (_value, row) => <SourceCell row={row} />,
      },
      {
        title: t("irPrice.table.instrument"),
        dataIndex: "assetId",
        key: "assetId",
        width: 210,
        render: (_value, row) => <InstrumentCell row={row} />,
      },
      {
        title: t("irPrice.table.price"),
        dataIndex: "mid",
        key: "mid",
        align: "right",
        width: 155,
        sorter: (a, b) => (a.mid ?? -1) - (b.mid ?? -1),
        render: (value: number | null) => (
          <Price value={value} scale={scale} color="var(--text)" bold />
        ),
      },
      {
        title: t("irPrice.table.bid"),
        dataIndex: "bid",
        key: "bid",
        align: "right",
        width: 150,
        sorter: (a, b) => (a.bid ?? -1) - (b.bid ?? -1),
        render: (value: number | null) => (
          <Price value={value} scale={scale} color="var(--up)" />
        ),
      },
      {
        title: t("irPrice.table.ask"),
        dataIndex: "ask",
        key: "ask",
        align: "right",
        width: 150,
        sorter: (a, b) => (a.ask ?? -1) - (b.ask ?? -1),
        render: (value: number | null) => (
          <Price value={value} scale={scale} color="var(--down)" />
        ),
      },
      {
        title: t("common.change"),
        dataIndex: "changePercent",
        key: "changePercent",
        align: "right",
        width: 105,
        sorter: (a, b) => (a.changePercent ?? -999) - (b.changePercent ?? -999),
        render: (_value, row) => <ChangeCell row={row} />,
      },
      {
        title: t("common.trend"),
        dataIndex: "spark",
        key: "spark",
        width: 120,
        render: (spark: number[] | undefined) =>
          spark && spark.length > 1 ? (
            <Sparkline
              values={spark.map((value) => value * scale)}
              width={92}
              height={24}
            />
          ) : (
            <span className="text-fg-3 text-[12px]">—</span>
          ),
      },
      {
        title: t("common.status"),
        dataIndex: "status",
        key: "status",
        width: 120,
        render: (_value, row) => <StatusCell row={row} />,
      },
    ],
    [scale, t],
  );
}
