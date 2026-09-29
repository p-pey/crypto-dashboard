"use client";

import { Empty, Segmented, Table } from "antd";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import {
  CATEGORY_LABEL_KEYS,
  MARKET_CATEGORIES,
  MARKET_SOURCES,
  marketSource,
  type MarketCategory,
  type MarketSourceId,
} from "~/constants/iranMarket";
import { formatNumber } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { buildMarketBoard } from "./iranMarket.mapper";
import { useMarketColumns, type QuoteUnit } from "./IrMarketTable.utils";

export type { QuoteUnit };
import type {
  ExchangeBoard,
  MarketRow,
} from "~/services/iran/iran.market.types";
import type { IrTicker } from "~/services/iran/iran.types";
import type { NerkhSnapshot } from "~/services/nerkh/nerkh.types";

type CategoryFilter = MarketCategory | "all";
type SourceFilter = MarketSourceId | "all";

type Props = {
  tickers: IrTicker[];
  boards: ExchangeBoard[];
  nerkh: NerkhSnapshot | undefined;
  loading: boolean;
  unit: QuoteUnit;
  onUnit: (unit: QuoteUnit) => void;
};

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The unified Iranian price board.
 *
 * Exchange order books, Wallex's full Toman market list and the nerkh.io rate
 * feed are merged into one row set, grouped by category and filterable by
 * source, so the same screen answers "what is gold trading at" and "where is
 * it cheapest" without a page change.
 */
export default function IrMarketTable({
  tickers,
  boards,
  nerkh,
  loading,
  unit,
  onUnit,
}: Props) {
  const { locale, t } = useI18n();
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [source, setSource] = useState<SourceFilter>("all");
  const columns = useMarketColumns(unit);

  const allRows = useMemo(
    () => buildMarketBoard({ tickers, boards, nerkh, locale }),
    [boards, locale, nerkh, tickers],
  );

  const availableSources = useMemo(() => {
    const present = new Set(allRows.map((row) => row.source));
    return MARKET_SOURCES.filter((candidate) => present.has(candidate.id));
  }, [allRows]);

  const rows = useMemo(
    () =>
      allRows.filter(
        (row) =>
          (category === "all" || row.category === category) &&
          (source === "all" || row.source === source),
      ),
    [allRows, category, source],
  );

  const stats = useMemo(() => {
    const usdt = allRows.filter(
      (row) => row.assetId === "usdt" && row.mid !== null,
    );

    const cheapest = (list: MarketRow[]) =>
      list.reduce<MarketRow | null>(
        (lo, current) =>
          (current.mid ?? Infinity) < (lo?.mid ?? Infinity) ? current : lo,
        null,
      );

    return {
      rows: allRows.length,
      sources: availableSources.length,
      bestUsdt: cheapest(usdt),
      // 18k gold is not listed on any of the exchanges, so the reference rate
      // always comes from nerkh.io.
      gold18k: allRows.find(
        (row) => row.labelKey === "nerkh.instruments.GOLD18K",
      ),
    };
  }, [allRows, availableSources.length]);

  const scale = unit === "toman" ? 1 / 10 : 1;
  const unitLabel = t(
    unit === "toman" ? "nerkh.units.toman" : "nerkh.units.rial",
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t("irPrice.stats.instruments")}
          value={formatNumber(locale, stats.rows, { maximumFractionDigits: 0 })}
          accent="var(--brand-2)"
        />
        <Stat
          label={t("irPrice.stats.sources")}
          value={`${stats.sources} / ${MARKET_SOURCES.length}`}
          accent="var(--cyan)"
        />
        <Stat
          label={t("irPrice.stats.bestUsdt")}
          value={
            stats.bestUsdt?.mid === null || stats.bestUsdt === null
              ? "—"
              : formatNumber(locale, stats.bestUsdt.mid * scale, {
                  maximumFractionDigits: 0,
                })
          }
          hint={
            stats.bestUsdt
              ? marketSource(stats.bestUsdt.source).label
              : undefined
          }
          accent="var(--up)"
        />
        <Stat
          label={t("irPrice.stats.gold18k")}
          value={
            stats.gold18k?.mid === null || stats.gold18k === undefined
              ? "—"
              : formatNumber(locale, stats.gold18k.mid * scale, {
                  maximumFractionDigits: 0,
                })
          }
          hint={
            stats.gold18k ? marketSource(stats.gold18k.source).label : undefined
          }
          accent="var(--amber)"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented<SourceFilter>
          value={source}
          onChange={setSource}
          options={[
            { label: t("irPrice.filter.allSources"), value: "all" },
            ...availableSources.map((candidate) => ({
              value: candidate.id,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ background: candidate.color }}
                  />
                  {candidate.label}
                </span>
              ),
            })),
          ]}
        />

        <Segmented<CategoryFilter>
          value={category}
          onChange={setCategory}
          options={[
            { label: t("irPrice.filter.allCategories"), value: "all" },
            ...MARKET_CATEGORIES.map((value) => ({
              value: value,
              label: t(CATEGORY_LABEL_KEYS[value]),
            })),
          ]}
        />

        <div className="ms-auto flex items-center gap-2">
          <span className="text-fg-3 text-[10.5px] font-semibold tracking-[0.12em] uppercase">
            {t("nerkh.unitToggle")}
          </span>
          <Segmented<QuoteUnit>
            value={unit}
            onChange={onUnit}
            options={[
              { label: t("nerkh.units.rial"), value: "rial" },
              { label: t("nerkh.units.toman"), value: "toman" },
            ]}
          />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <Table<MarketRow>
          rowKey="key"
          size="small"
          loading={loading && allRows.length === 0}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 40, showSizeChanger: false, size: "small" }}
          scroll={{ x: 1380 }}
          locale={{
            emptyText: <Empty description={t("irPrice.empty")} />,
          }}
          summary={() =>
            rows.length === 0 && allRows.length > 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <p className="text-fg-3 py-3 text-center text-[12px]">
                    {t("irPrice.noMatch")}
                  </p>
                </td>
              </tr>
            ) : null
          }
        />
      </motion.div>

      <p className="text-fg-3 px-1 text-[11px]">
        {t("irPrice.unitHint", unitLabel)}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent: string;
  hint?: string;
}) {
  return (
    <div className="border-line bg-surface-2/60 rounded-[14px] border px-4 py-3">
      <p className="text-fg-3 text-[10px] font-semibold tracking-[0.12em] uppercase">
        {label}
      </p>
      <p
        className="num mt-1 truncate text-[19px] leading-tight font-extrabold tabular-nums"
        style={{ color: accent }}
      >
        {value}
      </p>
      {hint && <p className="text-fg-3 truncate text-[10.5px]">{hint}</p>}
    </div>
  );
}
