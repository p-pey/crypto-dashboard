import type { CoinRow, CoinSort, CoinSortKey, SortDirection } from "./coin.types";

/**
 * Row ordering, as a pure function.
 *
 * Kept free of React and of the store so the rules can be checked directly, and
 * so the table and the store agree on one definition of "sorted".
 *
 * Two rules that are easy to get wrong and are therefore stated here:
 *
 * - **Nulls always sink.** A coin with no market cap belongs at the bottom
 *  whether the column is ascending or descending. Sorting `null` as zero would
 *  interleave uncapped coins in among the small ones, which reads as data.
 * - **Rank is not a number to sort by.** It is a consequence of market cap
 *  ordering, so sorting by it would pin the table to one ordering forever. It
 *  ties back to market cap and breaks the tie on symbol.
 */

/**
 * Parses a formatted string without letting `parseFloat("")` become NaN.
 *
 * Every sortable column reduces to `number | null`: even `changePercent` is
 * stored pre-formatted for display but compared as the number underneath, so a
 * sign or a trailing percent sign can never change the ordering.
 */
function numeric(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : null;
}

function valueOf(row: CoinRow, key: CoinSortKey): number | null {
  switch (key) {
    case "rank":
      return row.marketCapRank;
    case "price":
      return numeric(row.price);
    case "marketCap":
      return row.marketCap;
    case "volume24h":
      return row.volume24h;
    case "changePercent":
      return numeric(row.changePercent);
  }
}

/** Numeric columns default to descending; a rank column defaults to ascending. */
export function initialDirection(key: CoinSortKey): SortDirection {
  return key === "rank" ? "asc" : "desc";
}

/**
 * Advances the header through its three states.
 *
 * A column offers **both** directions before giving up: the natural one, then its
 * reverse, then the store's own order. The reverse is included because a
 * descending default makes "click again" the only way to see the bottom of a
 * column, and without it a price or change column would be sortable in one
 * direction only.
 *
 * The third state restores the original ordering rather than stalling, so the
 * table always has a meaningful way back to how it was found.
 */
export function nextSort(current: CoinSort, key: CoinSortKey): CoinSort | null {
  const initial = initialDirection(key);

  if (current.key !== key) return { key, direction: initial };

  const opposite: SortDirection = current.direction === "asc" ? "desc" : "asc";
  return current.direction === initial
    ? { key, direction: opposite }
    : null;
}

export function sortRows(
  rows: readonly CoinRow[],
  sort: CoinSort | null,
): CoinRow[] {
  if (!sort) return [...rows];

  const { key, direction } = sort;
  const sign = direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const left = valueOf(a, key);
    const right = valueOf(b, key);

    // Nulls sink regardless of direction, so a coin without a market cap never
    // interleaves with the small ones as if it were a small one.
    if (left === null && right === null) return a.base.localeCompare(b.base);
    if (left === null) return 1;
    if (right === null) return -1;

    if (left !== right) return (left - right) * sign;

    // Deterministic tie-break, so rows do not shuffle between refreshes when two
    // coins share a rounded value.
    return a.base.localeCompare(b.base);
  });
}

/** Row numbers, assigned after sorting so the `#` column matches what is shown. */
export function applyRank(rows: CoinRow[]): CoinRow[] {
  return rows.map((row, index) =>
    row.rank === index + 1 ? row : { ...row, rank: index + 1 },
  );
}
