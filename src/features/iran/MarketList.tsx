"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  gridTemplate,
  initialDirection,
  sortRows,
  type ListColumn,
  type SortState,
} from "./marketList.sort";

const PAGE = 40;

/**
 * A sticky-headed list with the same columns and rows a table would give, built
 * on CSS grid.
 *
 * Two things make this better than a `<table>` here: the header sticks without
 * fighting `position: sticky` against a scroll container, and a row can be as
 * tall as it needs without the browser reconciling cells across colgroups. The
 * grid template is derived from the column widths, so adding a column is a
 * single entry in the column array and nothing else changes.
 */
export default function MarketList<T extends { key: string }>({
  rows,
  columns,
  initialSort,
  emptyLabel,
  loading = false,
}: {
  rows: T[];
  columns: ListColumn<T>[];
  /** Column the list starts sorted by, or null to keep the given order. */
  initialSort?: { key: string; direction: "asc" | "desc" } | null;
  emptyLabel: ReactNode;
  /** Draws a skeleton instead of the empty state on a cold load. */
  loading?: boolean;
}) {
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);
  const [shown, setShown] = useState(PAGE);

  const template = useMemo(() => gridTemplate(columns), [columns]);
  const sorted = useMemo(
    () => sortRows(rows, columns, sort),
    [columns, rows, sort],
  );
  const visible = useMemo(() => sorted.slice(0, shown), [shown, sorted]);

  function toggleSort(column: ListColumn<T>) {
    if (!column.sortable) return;
    setShown(PAGE);
    setSort((current) => {
      if (current?.key !== column.key) {
        return { key: column.key, direction: initialDirection(column, rows) };
      }
      if (current.direction === "asc") {
        return { key: column.key, direction: "desc" };
      }
      // A third click returns to the order the data arrived in.
      return null;
    });
  }

  if (rows.length === 0) {
    if (loading) return <Skeleton columns={columns.length} />;
    return (
      <div className="border-line text-fg-3 grid place-items-center rounded-[14px] border border-dashed py-16 text-[13px]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <div className="min-w-[860px]" role="table">
          {/* Header */}
          <div
            className="border-line bg-surface-2/85 text-fg-3 sticky top-0 z-10 grid gap-2 rounded-[10px] border-b px-3 py-2.5 text-[10.5px] font-bold tracking-[0.1em] uppercase backdrop-blur-md"
            style={{ gridTemplateColumns: template }}
            role="rowgroup"
          >
            <div className="contents" role="row">
              {columns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <div
                    key={column.key}
                    role="columnheader"
                    aria-sort={
                      active
                        ? sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className={`flex min-w-0 items-center ${
                      column.align === "end"
                        ? "justify-end text-end"
                        : "text-start"
                    }`}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="hover:text-fg-2 flex items-center gap-1 truncate transition-colors"
                      >
                        {column.titleNode ?? column.title}
                        <span
                          className={`text-[9px] ${
                            active ? "text-brand-2" : "text-transparent"
                          }`}
                          aria-hidden
                        >
                          {active && sort.direction === "asc" ? "▲" : "▼"}
                        </span>
                      </button>
                    ) : (
                      <span className="truncate">{column.title}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rows */}
          <ul className="flex flex-col" role="rowgroup">
            {visible.map((row) => (
              <li
                key={row.key}
                role="row"
                className="border-line/50 hover:bg-surface-2/60 grid items-center gap-2 border-b px-3 py-2 transition-colors duration-150"
                style={{ gridTemplateColumns: template }}
              >
                {columns.map((column) => (
                  <div
                    key={column.key}
                    role="cell"
                    className={`flex min-w-0 items-center ${
                      column.align === "end" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {column.render(row)}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {visible.length < sorted.length && (
        <button
          type="button"
          onClick={() => setShown((current) => current + PAGE)}
          className="border-line text-fg-2 hover:border-brand/50 hover:text-fg mx-auto rounded-full border px-4 py-1.5 text-[12px] font-semibold transition-colors"
        >
          {`+ ${Math.min(PAGE, sorted.length - visible.length)}`}
        </button>
      )}
    </div>
  );
}

/** Placeholder rows so a cold load has the shape of the real thing. */
function Skeleton({ columns }: { columns: number }) {
  return (
    <div
      className="border-line rounded-[14px] border border-dashed px-3"
      aria-hidden
    >
      {Array.from({ length: 8 }, (_, row) => (
        <div
          key={row}
          className="border-line/50 grid gap-2 border-b py-2.5"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }, (_, cell) => (
            <div
              key={cell}
              className="bg-surface-3 h-3.5 animate-pulse rounded"
              style={{ width: `${45 + ((row * 7 + cell * 13) % 45)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
