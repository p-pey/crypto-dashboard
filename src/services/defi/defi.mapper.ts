import "server-only";

import { toNumber } from "~/lib/cachedSource";

import type {
  DefiChain,
  DefiOverview,
  DefiOverviewRow,
} from "./defi.types";

/**
 * DefiLlama mappers.
 *
 * Two rules run through all of them:
 *
 * - **Nothing is defaulted to zero.** A missing field becomes `null`, because a
 *   protocol that earned nothing and a protocol nobody measured must not look
 *   the same on a ranked board.
 * - **`breakdown24h` is `chain -> protocol -> usd`**, which is two levels of
 *   nesting for one number. It is the only place chain concentration comes from
 *   on an overview route, so it is read rather than requested away.
 */

/** Casts a raw object to a record without trusting it. */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asStringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

/** Sums a `{ "peggedUSD": n }` style map, or null when it holds no numbers. */
function sumPegs(value: unknown): number | null {
  const record = asRecord(value);
  let total = 0;
  let seen = false;

  for (const entry of Object.values(record)) {
    const parsed = toNumber(entry);
    if (parsed === null) continue;
    total += parsed;
    seen = true;
  }

  return seen ? total : null;
}

export function mapOverview(payload: unknown): DefiOverview {
  const root = asRecord(payload);

  return {
    total24h: toNumber(root.total24h),
    total7d: toNumber(root.total7d),
    total30d: toNumber(root.total30d),
    totalAllTime: toNumber(root.totalAllTime),
    change_1d: toNumber(root.change_1d),
    change_7d: toNumber(root.change_7d),
    change_1m: toNumber(root.change_1m),
    allChains: asStringArray(root.allChains),
    protocols: asArray(root.protocols).map(mapOverviewRow),
  };
}

function mapOverviewRow(value: unknown): DefiOverviewRow {
  const row = asRecord(value);

  return {
    name: asString(row.name) ?? asString(row.displayName) ?? "unknown",
    slug: asString(row.slug),
    category: asString(row.category),
    total24h: toNumber(row.total24h),
    total7d: toNumber(row.total7d),
    total30d: toNumber(row.total30d),
    totalAllTime: toNumber(row.totalAllTime),
    change_1d: toNumber(row.change_1d),
    change_7d: toNumber(row.change_7d),
    change_1m: toNumber(row.change_1m),
    breakdown24h: mapBreakdown(row.breakdown24h),
  };
}

/**
 * `chain -> protocol -> usd`, only when the caller kept the breakdown.
 *
 * Returns null rather than `{}` for an excluded breakdown: the two mean
 * "nobody traded" and "we did not ask", and the board reports which.
 */
function mapBreakdown(
  value: unknown,
): Record<string, Record<string, number>> | null {
  if (!value || typeof value !== "object") return null;

  const out: Record<string, Record<string, number>> = {};

  for (const [chain, protocols] of Object.entries(asRecord(value))) {
    const inner = asRecord(protocols);
    const entries: Record<string, number> = {};

    for (const [protocol, usd] of Object.entries(inner)) {
      const parsed = toNumber(usd);
      if (parsed !== null) entries[protocol] = parsed;
    }

    out[chain] = entries;
  }

  return out;
}

export function mapChains(payload: unknown): DefiChain[] {
  return asArray(payload)
    .map((value): DefiChain | null => {
      const row = asRecord(value);
      const name = asString(row.name);
      // `/chains` also carries non-chain bookkeeping rows in some responses;
      // a row without a name cannot be joined against anything.
      if (!name) return null;

      return {
        name,
        tvl: toNumber(row.tvl),
        tokenSymbol: asString(row.tokenSymbol),
        change_1d: toNumber(row.change_1d),
        change_7d: toNumber(row.change_7d),
        change_1m: toNumber(row.change_1m),
      };
    })
    .filter((row): row is DefiChain => row !== null);
}