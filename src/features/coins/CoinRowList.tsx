"use client";

import { Tooltip } from "antd";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { formatNumber } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type { StatusVerdict } from "~/services/statuses/statuses.types";
import type { CoinRow, CoinSortKey } from "~/services/coins/coin.types";
import CoinDetailPanel from "./CoinDetailPanel";
import CoinRowItem from "./CoinRowItem";
import { ROW_HEIGHT, useWindowedRows } from "./useWindowedRows";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The windowed, sortable coin list.
 *
 * Rendered as a CSS grid rather than an antd `Table`, for the same reasons the
 * Iranian board is: the sticky header, the fixed row height that windowing needs,
 * and full control over how a flashing price cell is painted.
 *
 * ## The expansion trick
 *
 * An expanded row is rendered as a sibling *inside* the window, not as an extra
 * `<tr>`. That matters for two reasons. It keeps the fixed-height arithmetic
 * honest, because the detail block occupies its own slot rather than stretching
 * a row and invalidating every offset after it. And it means toggling one row
 * does not rebuild the row array, so the other visible rows do not re-render.
 */
type Props = {
  rows: CoinRow[];
  sortKey: CoinSortKey | null;
  sortDirection: "asc" | "desc";
  onSort: (key: CoinSortKey) => void;
  verdicts: Record<string, { verdict: StatusVerdict; score: number }>;
  loading: boolean;
  emptyLabel: string;
};

export default function CoinRowList({
  rows,
  sortKey,
  sortDirection,
  onSort,
  verdicts,
  loading,
  emptyLabel,
}: Props) {
  const { locale, t } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = useCallback((symbol: string) => {
    setExpanded((current) => (current === symbol ? null : symbol));
  }, []);

  /**
   * Collapses the windowed list into a flat sequence of slots.
   *
   * Every row contributes a fixed-height slot, and the one expanded row
   * contributes a second slot for its detail block. Rendering them as one list
   * means the padding arithmetic stays in one place instead of being split
   * between the table and the expanded area.
   */
  const slots = buildSlots(rows, expanded);

  const { windowRef, window: win, onScroll } = useWindowedRows(slots.length);

  if (rows.length === 0) {
    return (
      <div className="border-line text-fg-3 grid place-items-center rounded-[14px] border border-dashed py-16 text-[13px]">
        {loading ? t("common.loading") : emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={windowRef}
        onScroll={onScroll}
        className="border-line overflow-y-auto rounded-[12px] border"
        style={{ maxHeight: "calc(100dvh - 300px)" }}
      >
        <div style={{ height: "100%" }}>
          <div
            role="row"
            className="border-line bg-surface-2/85 text-fg-3 sticky top-0 z-20 grid items-center gap-3 border-b px-3 py-3 text-[10.5px] font-bold tracking-[0.1em] uppercase backdrop-blur-md"
            style={{
              gridTemplateColumns:
                "44px minmax(190px,2fr) 130px 96px 118px 108px 104px 32px",
              height: ROW_HEIGHT - 8,
            }}
          >
            <Head
              label={t("markets.columns.order")}
              k="rank"
              sortKey={sortKey}
              dir={sortDirection}
              onSort={onSort}
            />
            <Head
              label={t("markets.columns.symbol")}
              k={null}
              sortKey={sortKey}
              dir={sortDirection}
              onSort={onSort}
            />
            <Head
              label={t("markets.columns.price")}
              k="price"
              sortKey={sortKey}
              dir={sortDirection}
              onSort={onSort}
              align="end"
            />
            <Head
              label={t("markets.columns.marketCap")}
              k="marketCap"
              sortKey={sortKey}
              dir={sortDirection}
              onSort={onSort}
              align="end"
            />
            <Head
              label={t("markets.columns.volume24h")}
              k="volume24h"
              sortKey={sortKey}
              dir={sortDirection}
              onSort={onSort}
              align="end"
            />
            <Head
              label={t("markets.columns.trend")}
              k={null}
              sortKey={sortKey}
              dir={sortDirection}
              onSort={onSort}
              align="end"
              hint={t("markets.columns.trendHint")}
            />
            <Head
              label={t("markets.columns.change")}
              k="changePercent"
              sortKey={sortKey}
              dir={sortDirection}
              onSort={onSort}
              align="end"
            />
            <span />
          </div>

          <div style={{ paddingTop: win.padTop, paddingBottom: win.padBottom }}>
            <AnimatePresence initial={false} mode="popLayout">
              {slots.slice(win.start, win.end).map((slot) =>
                slot.kind === "detail" ? (
                  <motion.div
                    key={`detail-${slot.symbol}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.26, ease: EASE }}
                    style={{ overflow: "hidden" }}
                  >
                    <CoinDetailPanel row={slot.row} withStatus />
                  </motion.div>
                ) : (
                  <div
                    key={`row-${slot.symbol}`}
                    style={{ height: ROW_HEIGHT }}
                  >
                    <CoinRowItem
                      row={slot.row}
                      expanded={slot.row.symbol === expanded}
                      onToggle={toggle}
                      verdict={verdicts[slot.row.id]}
                    />
                  </div>
                ),
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <p className="text-fg-3 px-1 text-[10.5px]">
        {t("markets.showing")
          .replace(
            "%s",
            formatNumber(locale, win.end - win.start, {
              maximumFractionDigits: 0,
            }),
          )
          .replace("%s", String(rows.length))}{" "}
        {win.unmeasured ? "" : t("markets.windowed")}
      </p>
    </div>
  );
}

/**
 * One renderable slot.
 *
 * A row is one fixed-height slot; an expanded row adds a second, variable-height
 * slot for its detail. The index space is therefore not the same as the row
 * index, which is why the windowing arithmetic works on this list rather than on
 * `rows` directly.
 */
type Slot =
  | { kind: "row"; symbol: string; row: CoinRow }
  | { kind: "detail"; symbol: string; row: CoinRow };

function buildSlots(rows: CoinRow[], expanded: string | null): Slot[] {
  const slots: Slot[] = [];
  for (const row of rows) {
    slots.push({ kind: "row", symbol: row.symbol, row });
    if (row.symbol === expanded) {
      slots.push({ kind: "detail", symbol: row.symbol, row });
    }
  }
  return slots;
}

function Head({
  label,
  k,
  sortKey,
  dir,
  onSort,
  align = "start",
  hint,
}: {
  label: string;
  k: CoinSortKey | null;
  sortKey: CoinSortKey | null;
  dir: "asc" | "desc";
  onSort: (key: CoinSortKey) => void;
  align?: "start" | "end";
  hint?: string;
}) {
  const { t } = useI18n();
  const active = k !== null && sortKey === k;

  const content = (
    <span
      className={`inline-flex items-center gap-1 truncate ${align === "end" ? "justify-end" : ""} ${
        k === null ? "" : "hover:text-fg-2 cursor-pointer transition-colors"
      }`}
    >
      {label}
      {k !== null ? (
        <span
          aria-hidden
          className={`text-[9px] ${active ? "text-brand-2" : "text-transparent"}`}
        >
          {active && dir === "asc" ? "\u25b2" : "\u25bc"}
        </span>
      ) : null}
    </span>
  );

  if (k === null) {
    return hint ? (
      <Tooltip title={hint}>
        <span className="block truncate">{content}</span>
      </Tooltip>
    ) : (
      <span className="block truncate">{content}</span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      // `aria-sort` is not valid on a button, so the direction is announced on
      // the arrow itself, which is what a screen reader will actually read out.
      aria-label={
        active
          ? `${label}, ${dir === "asc" ? "ascending" : "descending"}`
          : label
      }
      title={t("markets.columns.sortHint")}
      className={`flex w-full min-w-0 ${align === "end" ? "justify-end" : ""}`}
    >
      {content}
    </button>
  );
}
