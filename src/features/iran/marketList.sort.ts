import type { ReactNode } from "react";

/**
 * Pure list mechanics: the grid track, and ordering rows by a column.
 *
 * Kept apart from the view because none of it needs React, which keeps
 * `MarketList` to rendering and makes this directly testable.
 */

export type ColumnAlign = "start" | "end";

export type ListColumn<T> = {
  key: string;
  /** Fraction of the track this column takes. */
  width: string;
  align: ColumnAlign;
  title: string;
  titleNode?: ReactNode;
  render: (row: T) => ReactNode;
  /** Comparable value used when the column is the sort key. */
  sortValue: (row: T) => number | string | null;
  sortable?: boolean;
};

export type SortState = {
  key: string | null;
  direction: "asc" | "desc";
};

/**
 * The CSS grid track for a set of columns.
 *
 * Deriving it from the column widths means adding a column is a single entry in
 * the column array, and the header and every row stay aligned by construction.
 */
export function gridTemplate<T>(columns: ListColumn<T>[]): string {
  return columns.map((column) => column.width).join(" ");
}

/**
 * Orders rows by a column, putting rows with no value for it at the bottom
 * whichever way the sort runs, since "unknown" is never the cheapest or the
 * largest reading.
 */
export function sortRows<T>(
  rows: T[],
  columns: ListColumn<T>[],
  sort: SortState | null,
): T[] {
  if (!sort) return rows;
  const column = columns.find((candidate) => candidate.key === sort.key);
  if (!column) return rows;

  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = column.sortValue(a);
    const right = column.sortValue(b);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (typeof left === "number" && typeof right === "number") {
      return (left - right) * factor;
    }
    return String(left).localeCompare(String(right)) * factor;
  });
}

/**
 * The direction a column starts in when it first becomes the sort key: numbers
 * read best high to low, so a price column opens descending.
 */
export function initialDirection<T>(
  column: ListColumn<T>,
  rows: T[],
): "asc" | "desc" {
  const sample = rows[0];
  const isNumeric =
    sample !== undefined && typeof column.sortValue(sample) === "number";
  return isNumeric ? "desc" : "asc";
}
