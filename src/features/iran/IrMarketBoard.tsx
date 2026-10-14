"use client";

import { Select, Tooltip } from "antd";
import { motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import {
  CATEGORY_LABEL_KEYS,
  MARKET_CATEGORIES,
  MARKET_SOURCES,
  marketSource,
  POLLED_SOURCES,
  SOCKET_SOURCES,
  type MarketCategory,
  type MarketSourceId,
  type MarketSourceTransport,
} from "~/constants/iranMarket";
import CacheStatus from "~/components/shared/CacheStatus";
import UpdatedStamp from "~/components/shared/UpdatedStamp";
import { formatNumber } from "~/i18n/format";
import { Stat } from "~/components/ui";
import { useI18n } from "~/i18n/I18nProvider";
import type {
  ExchangeBoard,
  MarketRow,
} from "~/services/iran/iran.market.types";
import type { IrTicker } from "~/services/iran/iran.types";
import type { NerkhSnapshot } from "~/services/nerkh/nerkh.types";
import type { TgjuSnapshot } from "~/services/tgju/tgju.types";
import MarketList from "./MarketList";
import {
  buildComparison,
  useBoardColumns,
  useComparisonColumns,
  type QuoteUnit,
  type TradeIntent,
} from "./board.columns";
import { buildMarketBoard } from "./iranMarket.mapper";
import { useRollingSeries } from "./useRollingSeries";

export type { QuoteUnit };

type Props = {
  tickers: IrTicker[];
  boards: ExchangeBoard[];
  nerkh: NerkhSnapshot | undefined;
  tgju: TgjuSnapshot | undefined;
  loading: boolean;
  unit: QuoteUnit;
  onUnit: (unit: QuoteUnit) => void;
  onRefresh: () => void;
  refreshing: boolean;
  /** Epoch ms the board data last changed. */
  updatedAt: number | null;
  /**
   * Opens the order ticket for a row. Null when trading is not available, which
   * is what hides the venue buttons entirely rather than showing dead ones.
   */
  onTrade: ((intent: TradeIntent) => void) | null;
};

const EASE = [0.16, 1, 0.3, 1] as const;

type View = "board" | "compare";

/**
 * The unified Iranian price board.
 *
 * Exchange order books, Wallex's full Toman market list and the nerkh.io and
 * TGJU rate feeds are merged into one row set, so the same screen answers "what is gold
 * trading at" and "who is quoting it cheapest" without a page change.
 */
export default function IrMarketBoard({
  tickers,
  boards,
  nerkh,
  tgju,
  loading,
  unit,
  onUnit,
  onRefresh,
  refreshing,
  updatedAt,
  onTrade,
}: Props) {
  const { locale, t } = useI18n();
  const [view, setView] = useState<View>("board");
  const [sources, setSources] = useState<MarketSourceId[]>([]);
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [query, setQuery] = useState("");

  const allRows = useMemo(
    () => buildMarketBoard({ tickers, boards, nerkh, tgju, locale }),
    [boards, locale, nerkh, tgju, tickers],
  );

  // One price per row per snapshot; the hook turns that into a 1h series.
  const points = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of allRows) {
      if (row.mid !== null) map.set(row.key, row.mid);
    }
    return map;
  }, [allRows]);

  const { series: spark, reset: resetSpark } = useRollingSeries(points);

  const availableSources = useMemo(() => {
    const present = new Set(allRows.map((row) => row.source));
    return MARKET_SOURCES.filter((candidate) => present.has(candidate.id));
  }, [allRows]);

  const sourceMeta = useMemo(
    () =>
      availableSources.map((source) => ({
        id: source.id satisfies string,
        label: source.label,
        color: source.color,
      })),
    [availableSources],
  );

  const columns = useBoardColumns(unit, spark, onTrade);
  const comparisonColumns = useComparisonColumns(unit, sourceMeta);

  const refresh = useCallback(() => {
    // A manual refresh should also restart the hour window, otherwise the
    // sparkline would keep showing a series the user just threw away.
    resetSpark();
    onRefresh();
  }, [onRefresh, resetSpark]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allRows.filter((row) => {
      if (sources.length > 0 && !sources.includes(row.source)) return false;
      if (categories.length > 0 && !categories.includes(row.category))
        return false;
      if (needle.length === 0) return true;
      return (
        row.assetId.toLowerCase().includes(needle) ||
        (row.symbol ?? "").toLowerCase().includes(needle) ||
        (row.upstreamName ?? "").toLowerCase().includes(needle) ||
        marketSource(row.source).label.toLowerCase().includes(needle)
      );
    });
  }, [allRows, categories, query, sources]);

  const comparison = useMemo(
    () => buildComparison(filtered, sourceMeta),
    [filtered, sourceMeta],
  );

  const stats = useMemo(() => {
    const usdt = filtered.filter(
      (row) => row.assetId === "usdt" && row.mid !== null,
    );
    const best = usdt.reduce<MarketRow | null>(
      (lo, current) =>
        (current.mid ?? Infinity) < (lo?.mid ?? Infinity) ? current : lo,
      null,
    );
    const gold18k = allRows.find(
      (row) => row.labelKey === "nerkh.instruments.GOLD18K",
    );

    return {
      rows: filtered.length,
      sources: availableSources.length,
      bestUsdt: best,
      gold18k,
    };
  }, [allRows, availableSources.length, filtered]);

  const scale = unit === "toman" ? 1 / 10 : 1;
  const unitLabel = t(
    unit === "toman" ? "nerkh.units.toman" : "nerkh.units.rial",
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-fg-2 text-[13px] font-bold tracking-tight">
          {view === "board" ? t("irPrice.title") : t("irPrice.compare.view")}
        </span>
        <UpdatedStamp
          at={updatedAt}
          label={t("irPrice.lastUpdate")}
          refreshing={refreshing}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t("irPrice.stats.instruments")}
          value={formatNumber(locale, stats.rows, { maximumFractionDigits: 0 })}
          tone="brand"
        />
        <Stat
          label={t("irPrice.stats.sources")}
          value={`${stats.sources} / ${MARKET_SOURCES.length}`}
          tone="cyan"
        />
        <Stat
          label={t("irPrice.stats.bestUsdt")}
          value={
            stats.bestUsdt?.mid
              ? formatNumber(locale, stats.bestUsdt.mid * scale, {
                  maximumFractionDigits: 0,
                })
              : "—"
          }
          hint={
            stats.bestUsdt
              ? marketSource(stats.bestUsdt.source).label
              : undefined
          }
          tone="up"
        />
        <Stat
          label={t("irPrice.stats.gold18k")}
          value={
            stats.gold18k?.mid
              ? formatNumber(locale, stats.gold18k.mid * scale, {
                  maximumFractionDigits: 0,
                })
              : "—"
          }
          hint={
            stats.gold18k ? marketSource(stats.gold18k.source).label : undefined
          }
          tone="amber"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ViewToggle value={view} onChange={setView} />

        <Select
          mode="multiple"
          allowClear
          value={sources}
          onChange={setSources}
          placeholder={t("irPrice.filter.allSources")}
          style={{ minWidth: 200 }}
          maxTagCount="responsive"
          options={availableSources.map((source) => ({
            value: source.id,
            label: (
              <span className="inline-flex min-w-[190px] items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: source.color }}
                />
                <span className="flex-1">{source.label}</span>
                <TransportBadge transport={source.transport} />
              </span>
            ),
          }))}
        />

        <Select
          mode="multiple"
          allowClear
          value={categories}
          onChange={setCategories}
          placeholder={t("irPrice.filter.allCategories")}
          style={{ minWidth: 190 }}
          maxTagCount="responsive"
          options={MARKET_CATEGORIES.map((value) => ({
            value,
            label: t(CATEGORY_LABEL_KEYS[value]),
          }))}
        />

        <Select
          allowClear
          value={query || undefined}
          onChange={(value) => setQuery(value ?? "")}
          placeholder={t("irPrice.filter.search")}
          style={{ minWidth: 170 }}
          showSearch
          onSearch={setQuery}
          filterOption={false}
        />

        <div className="ms-auto flex items-center gap-2">
          <Select<QuoteUnit>
            value={unit}
            onChange={onUnit}
            style={{ width: 116 }}
            options={[
              { value: "rial", label: t("nerkh.units.rial") },
              { value: "toman", label: t("nerkh.units.toman") },
            ]}
          />
          {/*
            Only the crawled sources are re-read here. The socket sources have
            no button to press because there is nothing to ask for, so the
            tooltip says so rather than letting the button imply it refreshed
            the whole board.
          */}
          <Tooltip title={t("irPrice.poll.hint")}>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="border-line bg-surface-2/70 text-fg-2 hover:border-brand/50 hover:text-fg inline-flex h-8 items-center gap-2 rounded-full border px-3.5 text-[12px] font-semibold transition-all duration-300 active:scale-95 disabled:opacity-60"
            >
              <RefreshIcon spinning={refreshing} />
              {t("common.refresh")}
            </button>
          </Tooltip>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        {view === "board" ? (
          <MarketList
            rows={filtered}
            columns={columns}
            loading={loading && allRows.length === 0}
            emptyLabel={t("irPrice.empty")}
          />
        ) : (
          <MarketList
            rows={comparison}
            columns={comparisonColumns}
            loading={loading && allRows.length === 0}
            initialSort={{ key: "gap", direction: "desc" }}
            emptyLabel={t("irPrice.compare.empty")}
          />
        )}
      </motion.div>

      <p className="text-fg-3 px-1 text-[11px]">
        {t("irPrice.unitHint", unitLabel)} {t("irPrice.table.hourTrendHint")}
      </p>

      <div className="border-line bg-surface-2/40 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[10px] border px-3 py-2 text-[11px]">
        {SOCKET_SOURCES.map((source) => (
          <span
            key={source.id}
            className="text-fg-3 inline-flex items-center gap-1.5"
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: source.color }}
            />
            {source.label}
            <TransportBadge transport={source.transport} />
          </span>
        ))}
        <span className="text-fg-3 ms-auto inline-flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {POLLED_SOURCES.map((source) => (
            <span key={source.id} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: source.color }}
              />
              {source.label}
              <TransportBadge transport={source.transport} />
            </span>
          ))}
          {/* The crawled sources have no push channel, so the interval is the
              whole story for how current they are. */}
          <span className="text-fg-2 inline-flex items-center gap-1 font-semibold">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden
              className="size-3"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            {t("irPrice.poll.cadence")}
          </span>
        </span>
      </div>

      <CacheStatus />
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: View;
  onChange: (value: View) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="border-line bg-surface-2/70 flex items-center gap-1 rounded-full border p-1">
      {(
        [
          { value: "board", label: t("irPrice.compare.board") },
          { value: "compare", label: t("irPrice.compare.view") },
        ] as const
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-all duration-300 ${
            value === option.value
              ? "from-brand to-brand-2 bg-gradient-to-br text-white shadow-[0_4px_12px_-6px_var(--glow-1)]"
              : "text-fg-3 hover:bg-surface-3 hover:text-fg"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Says whether a source is streaming or crawled, so "refresh" has a visible
 * meaning on the board instead of being a button that quietly does half the job.
 */
function TransportBadge({ transport }: { transport: MarketSourceTransport }) {
  const { t } = useI18n();
  const live = transport === "socket";

  return (
    <span
      className="text-[9.5px] font-semibold whitespace-nowrap"
      style={{ color: live ? "var(--mint)" : "var(--amber)" }}
    >
      {live ? t("irPrice.websocketLive") : t("irPrice.restOnly")}
    </span>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-[15px] ${spinning ? "animate-spin" : ""}`}
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
