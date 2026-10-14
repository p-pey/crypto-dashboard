"use client";

import { Tooltip } from "antd";
import { marketSource } from "~/constants/iranMarket";
import Sparkline from "~/features/shared/Sparkline";
import FlashValue from "~/components/shared/FlashValue";
import { formatNumber, formatPercent, formatTime } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type { TranslationKey } from "~/i18n/dictionaries/types";
import type { MarketRow } from "~/services/iran/iran.market.types";
import { RIAL_PER_TOMAN } from "~/services/nerkh/nerkh.types";
import type { ListColumn } from "./marketList.sort";

/**
 * The board and the comparison view are rendered as lists rather than a
 * `<table>`.
 *
 * A real table would mean fighting the browser for a fixed header and a
 * horizontal scroll on a 200 row board, and antd's own table brings a large
 * amount of CSS for what is ultimately a grid of numbers. A CSS grid gives the
 * same columns and the same one row per source, a sticky header, and full
 * control over how a flashing cell is painted.
 */

export type { ListColumn } from "./marketList.sort";

/** Which unit the prices on screen are quoted in. */
export type QuoteUnit = "rial" | "toman";

/* ------------------------------------------------------------------ *
 * Feed health
 * ------------------------------------------------------------------ */

/**
 * The dot's colour for each feed state - the old status column's three states.
 *
 * `stale` is the middle one on purpose: the socket has not closed, it has just
 * gone quiet, which is a warning rather than a failure, and it is worth telling
 * apart because a quiet feed usually recovers on its own.
 */
const HEALTH_COLOR: Record<MarketRow["status"], string> = {
  live: "var(--mint)",
  stale: "var(--amber)",
  error: "var(--rose)",
};

/** `stale` is the quiet feed, so it gets its own wording rather than a reuse. */
const HEALTH_KEY = {
  live: "common.live",
  stale: "common.stale",
  error: "common.error",
} as const satisfies Record<MarketRow["status"], TranslationKey>;

/* ------------------------------------------------------------------ *
 * Price cells
 * ------------------------------------------------------------------ */

function unitScale(unit: "rial" | "toman"): number {
  return unit === "toman" ? 1 / RIAL_PER_TOMAN : 1;
}

/**
 * `flash` is off for the bid and ask columns: on a live order book both sides
 * move on almost every tick, and two extra flashing cells per row becomes a
 * wall of colour that hides the one number the eye is following.
 */
function Price({
  value,
  scale,
  color,
  bold = false,
  flash = false,
}: {
  value: number | null;
  scale: number;
  color?: string;
  bold?: boolean;
  flash?: boolean;
}) {
  const { locale } = useI18n();

  // An absent reading always reads as muted, whatever colour the column asked
  // for, so a missing price never looks like a live one.
  const muted = value === null ? "var(--text-3)" : undefined;

  return (
    <span
      className={`num whitespace-nowrap tabular-nums ${bold ? "text-[13.5px] font-bold" : "text-[12.5px] font-semibold"}`}
      style={{ color: muted ?? color ?? "var(--text)" }}
    >
      <FlashValue
        value={flash ? value : null}
        disabled={!flash}
        className="inline-block"
      >
        {value === null
          ? "—"
          : formatNumber(locale, value * scale, { maximumFractionDigits: 0 })}
      </FlashValue>
    </span>
  );
}

/**
 * The provider's name, its link, and the one dot that says whether the feed is
 * healthy.
 *
 * This dot used to be a whole column. It carries two independent things so it
 * can replace that column without losing anything:
 *
 *   colour - success while the feed is live, warning when it has gone quiet,
 *            fail when it is closed or refused. This is the column's old job.
 *   shape  - solid when a websocket produced this row, hollow when a crawl did.
 *
 * Shape is read from `row.live` rather than the provider's transport, because a
 * provider can do both: Wallex streams its tracked order books while its market
 * list is crawled, and only the row knows which one a given line came from.
 *
 * The provider keeps its own colour on the name, so identity is still readable
 * at a glance without spending a second channel on it.
 */
function SourceCell({ row }: { row: MarketRow }) {
  const { locale, t } = useI18n();
  const meta = marketSource(row.source);

  const health =
    row.error ??
    (row.updatedAt
      ? t("irPrice.table.lastUpdate", formatTime(locale, row.updatedAt))
      : t("irPrice.table.noUpdateYet"));

  const color = HEALTH_COLOR[row.status];

  const title = [
    t(HEALTH_KEY[row.status]),
    row.live ? t("irPrice.table.stream") : t("irPrice.restOnly"),
    health,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");

  return (
    <Tooltip title={title}>
      <a
        href={meta.website}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-w-0 items-center gap-2 text-[12.5px] font-semibold no-underline transition-opacity hover:opacity-80"
        style={{ color: meta.color }}
      >
        <span
          aria-hidden
          className={`size-2 shrink-0 rounded-full ${row.live && row.status === "live" ? "animate-pulse-soft" : ""}`}
          style={
            row.live
              ? { background: color }
              : // Hollow says "crawled, not streaming" without spending the
                // colour channel on it - the fill colour still means health.
                {
                  background: "transparent",
                  boxShadow: `inset 0 0 0 1.5px ${color}`,
                }
          }
        />
        <span className="truncate whitespace-nowrap">{meta.label}</span>
        <span className="sr-only">{title}</span>
      </a>
    </Tooltip>
  );
}

function InstrumentCell({ row }: { row: MarketRow }) {
  const { t } = useI18n();

  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-fg truncate text-[13px] font-semibold">
        {row.upstreamName ?? t(row.labelKey)}
      </span>
      <span dir="ltr" className="mono text-fg-3 truncate text-[10.5px]">
        {row.symbol ?? row.assetId}
      </span>
    </div>
  );
}

/**
 * One hour percentage move, taken from the rolling series the board already
 * accumulates. It is the only reading that means the same thing across all
 * five providers: Wallex publishes a 24 hour change, nerkh.io a 12 hour range,
 * and the websocket rows have no change field at all. Until an hour of history
 * exists the source's own figure is shown instead, dimmed, with a tooltip
 * naming that window so the two are never confused.
 */
function change1h(series: readonly number[] | undefined): number | null {
  if (!series || series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  if (first === undefined || last === undefined || first <= 0) return null;
  return ((last - first) / first) * 100;
}

function ChangeCell({
  row,
  series,
}: {
  row: MarketRow;
  series: readonly number[] | undefined;
}) {
  const { locale, t } = useI18n();
  const hour = change1h(series);

  if (hour === null) {
    if (row.changePercent === null) {
      return <span className="text-fg-3 text-[12px]">—</span>;
    }
    const sourceWindow =
      row.changeWindowHours === null
        ? t("irPrice.table.observed")
        : row.changeWindowHours === 24
          ? t("irPrice.table.window24h")
          : t("irPrice.table.window12h");
    return (
      <Tooltip title={sourceWindow}>
        <span className="num text-fg-3 text-[12.5px] font-semibold whitespace-nowrap tabular-nums opacity-70">
          {formatPercent(locale, row.changePercent, 2)}
        </span>
      </Tooltip>
    );
  }

  const flat = Math.abs(hour) < 0.005;
  return (
    <Tooltip title={t("irPrice.table.hourChangeHint")}>
      <span
        className="num text-[12.5px] font-semibold whitespace-nowrap tabular-nums"
        style={{
          color: flat
            ? "var(--text-2)"
            : hour > 0
              ? "var(--up)"
              : "var(--down)",
        }}
      >
        {formatPercent(locale, hour, 2)}
      </span>
    </Tooltip>
  );
}

function TrendCell({
  values,
  scale,
}: {
  values: readonly number[] | undefined;
  scale: number;
}) {
  const { t } = useI18n();

  if (!values || values.length < 2) {
    return <span className="text-fg-3 text-[12px]">—</span>;
  }

  return (
    <Tooltip title={t("irPrice.table.hourTrendHint")}>
      <div className="flex items-center justify-end">
        <Sparkline
          values={values.map((value) => value * scale)}
          width={64}
          height={22}
        />
      </div>
    </Tooltip>
  );
}

export type TradeIntent = {
  instrumentId: string;
  side: "buy" | "sell";
  /** The exact price shown in the row, in Rial. */
  priceInRial: number;
};

/**
 * Columns of the main board, one row per source per instrument.
 *
 * `onTrade` is optional so the board still renders anywhere it is reused without
 * trading wired up. It is also null for instruments nobody can trade, which is
 * how 18k gram gold ends up as a reference row: the venue buttons are simply
 * not offered, rather than offered and then failing.
 */
export function useBoardColumns(
  unit: "rial" | "toman",
  spark: ReadonlyMap<string, number[]>,
  onTrade: ((intent: TradeIntent) => void) | null,
): ListColumn<MarketRow>[] {
  const { t } = useI18n();
  const scale = unitScale(unit);

  return [
    {
      key: "source",
      width: "minmax(120px, 0.7fr)",
      align: "start",
      title: t("irPrice.table.source"),
      render: (row) => <SourceCell row={row} />,
      sortValue: (row) => marketSource(row.source).label,
    },
    {
      key: "instrument",
      width: "minmax(190px, 2fr)",
      align: "start",
      title: t("irPrice.table.instrument"),
      render: (row) => <InstrumentCell row={row} />,
      sortValue: (row) => row.upstreamName ?? row.assetId,
    },
    {
      key: "price",
      width: "minmax(130px, 0.9fr)",
      align: "end",
      title: t("irPrice.table.price"),
      render: (row) => (
        <Price value={row.mid} scale={scale} color="var(--text)" bold flash />
      ),
      sortValue: (row) => row.mid,
      sortable: true,
    },
    {
      key: "bid",
      width: "minmax(120px, 0.8fr)",
      align: "end",
      title: t("irPrice.table.bid"),
      render: (row) => (
        <Price value={row.bid} scale={scale} color="var(--up)" />
      ),
      sortValue: (row) => row.bid,
      sortable: true,
    },
    {
      key: "ask",
      width: "minmax(120px, 0.8fr)",
      align: "end",
      title: t("irPrice.table.ask"),
      render: (row) => (
        <Price value={row.ask} scale={scale} color="var(--down)" />
      ),
      sortValue: (row) => row.ask,
      sortable: true,
    },
    {
      key: "change",
      width: "minmax(84px, 0.5fr)",
      align: "end",
      title: t("irPrice.table.hourChange"),
      render: (row) => <ChangeCell row={row} series={spark.get(row.key)} />,
      sortValue: (row) => change1h(spark.get(row.key)) ?? row.changePercent,
      sortable: true,
    },
    {
      key: "trend",
      width: "minmax(68px, 0.4fr)",
      align: "end",
      title: t("irPrice.table.hourTrend"),
      render: (row) => <TrendCell values={spark.get(row.key)} scale={scale} />,
      sortValue: () => null,
    },
    ...(onTrade ? [tradeColumn((row) => onTrade(row), t)] : []),
  ];
}

/**
 * Buy and sell, priced off the row's own book.
 *
 * Buy is offered off the **ask** and sell off the **bid**, which is what the two
 * buttons actually cost. Using the mid for both would advertise a buy below the
 * market and a sell above it, and the difference between mid and the resting
 * side of the book is the spread the operator is paying.
 *
 * The price handed on is in Rial regardless of what the table is displaying; the
 * ticket owns the conversion to the venue's own quote unit.
 */
function tradeColumn(
  onTrade: (intent: TradeIntent) => void,
  t: ReturnType<typeof useI18n>["t"],
): ListColumn<MarketRow> {
  return {
    key: "trade",
    width: "minmax(128px, 0.6fr)",
    align: "end",
    title: t("trading.title"),
    render: (row) => (
      <TradeCell
        row={row}
        onTrade={onTrade}
        buyLabel={t("trading.action.buy")}
        sellLabel={t("trading.action.sell")}
      />
    ),
    sortValue: () => null,
  };
}

function TradeCell({
  row,
  onTrade,
  buyLabel,
  sellLabel,
}: {
  row: MarketRow;
  onTrade: (intent: TradeIntent) => void;
  buyLabel: string;
  sellLabel: string;
}) {
  const { t } = useI18n();
  // Reference-only instruments have no venue market and therefore no order to
  // send, so the cell explains that instead of offering a button that fails.
  // That covers every aggregator row (nerkh.io, TGJU) as well as book rows
  // without a symbol: none of them maps onto a tradeable venue market.
  if (row.source === "nerkh" || row.source === "tgju" || row.symbol === null) {
    return (
      <Tooltip title={t("trading.ticket.noTradeable")}>
        <span className="text-fg-3 text-[10px] whitespace-nowrap">
          {t("trading.ticket.noTradeable")}
        </span>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        disabled={row.ask === null}
        onClick={() =>
          onTrade({
            instrumentId: row.assetId,
            side: "buy",
            priceInRial: row.ask ?? 0,
          })
        }
        title={t("trading.ticket.confirmRestingHint")}
        className="h-7 rounded-full px-2.5 text-[11px] font-bold transition-all duration-300 active:scale-95 disabled:opacity-30"
        style={{ background: "var(--up)", color: "#04120c" }}
      >
        {buyLabel}
      </button>
      <button
        type="button"
        disabled={row.bid === null}
        onClick={() =>
          onTrade({
            instrumentId: row.assetId,
            side: "sell",
            priceInRial: row.bid ?? 0,
          })
        }
        title={t("trading.ticket.confirmRestingHint")}
        className="h-7 rounded-full px-2.5 text-[11px] font-bold transition-all duration-300 active:scale-95 disabled:opacity-30"
        style={{ background: "var(--down)", color: "#04120c" }}
      >
        {sellLabel}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Comparison view
 * ------------------------------------------------------------------ */

export function useComparisonColumns(
  unit: "rial" | "toman",
  sources: { id: string; label: string; color: string }[],
): ListColumn<ComparisonRow>[] {
  const { locale, t } = useI18n();
  const scale = unitScale(unit);

  const sourceColumns: ListColumn<ComparisonRow>[] = sources.map((source) => ({
    key: source.id,
    width: "minmax(120px, 0.8fr)",
    align: "end",
    title: source.label,
    titleNode: (
      <span
        className="inline-flex items-center gap-1.5"
        style={{ color: source.color }}
      >
        <span
          aria-hidden
          className="size-1.5 rounded-full"
          style={{ background: source.color }}
        />
        {source.label}
      </span>
    ),
    render: (row) => (
      <Price
        value={row.prices[source.id] ?? null}
        scale={scale}
        color={row.best?.source === source.id ? "var(--mint)" : undefined}
        bold={row.best?.source === source.id}
      />
    ),
    sortValue: (row) => row.prices[source.id] ?? null,
    sortable: true,
  }));

  return [
    {
      key: "instrument",
      width: "minmax(180px, 1.5fr)",
      align: "start",
      title: t("irPrice.table.instrument"),
      render: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-fg truncate text-[13px] font-semibold">
            {row.label}
          </span>
          <span dir="ltr" className="mono text-fg-3 truncate text-[10.5px]">
            {row.symbol}
          </span>
        </div>
      ),
      sortValue: (row) => row.label,
      sortable: true,
    },
    ...sourceColumns,
    {
      key: "gap",
      width: "minmax(96px, 0.6fr)",
      align: "end",
      title: t("irPrice.compare.gap"),
      render: (row) =>
        row.gapPercent === null ? (
          <span className="text-fg-3 text-[12px]">—</span>
        ) : (
          <span
            className="num text-[12.5px] font-bold tabular-nums"
            style={{
              color:
                row.gapPercent > 0.5
                  ? "var(--up)"
                  : row.gapPercent < -0.5
                    ? "var(--down)"
                    : "var(--text-2)",
            }}
          >
            {formatPercent(locale, row.gapPercent, 2)}
          </span>
        ),
      sortValue: (row) => row.gapPercent,
      sortable: true,
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Comparison pivot
 * ------------------------------------------------------------------ */

export type ComparisonRow = {
  key: string;
  assetId: string;
  category: MarketRow["category"];
  label: string;
  symbol: string;
  /** Mid price per source, in Rial. `null` where the source does not quote it. */
  prices: Record<string, number | null>;
  best: { source: string; value: number } | null;
  worst: { source: string; value: number } | null;
  /** Best-against-worst as a percentage of the cheapest, the arbitrage gap. */
  gapPercent: number | null;
  sources: number;
};

/**
 * Pivots rows into one row per instrument with a column per source, so a price
 * can be read across providers at a glance.
 */
export function buildComparison(
  rows: MarketRow[],
  sources: { id: string }[],
): ComparisonRow[] {
  const byAsset = new Map<string, MarketRow[]>();

  for (const row of rows) {
    if (row.mid === null) continue;
    const bucket = byAsset.get(row.assetId) ?? [];
    bucket.push(row);
    byAsset.set(row.assetId, bucket);
  }

  const out: ComparisonRow[] = [];

  for (const [assetId, bucket] of byAsset) {
    // Anything only one source quotes is not a comparison, so it is dropped.
    if (bucket.length < 2) continue;

    const prices: Record<string, number | null> = {};
    for (const source of sources) prices[source.id] = null;

    let best: ComparisonRow["best"] = null;
    let worst: ComparisonRow["best"] = null;

    for (const row of bucket) {
      if (row.mid === null) continue;
      prices[row.source] = row.mid;
      if (!best || row.mid < best.value)
        best = { source: row.source, value: row.mid };
      if (!worst || row.mid > worst.value)
        worst = { source: row.source, value: row.mid };
    }

    out.push({
      key: assetId,
      assetId,
      category: bucket[0]?.category ?? "crypto",
      label: bucket[0]?.upstreamName ?? assetId,
      symbol: bucket[0]?.symbol ?? assetId,
      prices,
      best,
      worst,
      gapPercent:
        best && worst && best.value > 0
          ? ((worst.value - best.value) / best.value) * 100
          : null,
      sources: bucket.length,
    });
  }

  return out;
}
