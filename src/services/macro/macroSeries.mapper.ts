import "server-only";

import { safeRatio, toNumber } from "~/lib/cachedSource";

/**
 * Macro mappers: Frankfurter (ECB reference rates) and World Bank indicators.
 *
 * Two gaps this fills in the app's macro coverage, both free and keyless:
 *
 * - **No FX series.** The app has rial, gold and dollar/Toman but no daily
 *   reference rates, so "the dollar strengthened" has nothing to be measured
 *   against. Frankfurter is the **ECB's own** published rates, which makes it a
 *   primary source rather than another aggregator's estimate.
 * - **No inflation series.** World Bank's CPI is monthly and slow-moving, which
 *   is exactly why it belongs here — it is the denominator against which any
 *   nominal figure in the app can be read.
 */

export type FxRate = {
  currency: string;
  /** Units of `currency` per 1 USD, as published. */
  perUsd: number | null;
};

export type FxSnapshot = {
  base: string;
  /** The publication date, which is a business day behind on weekends. */
  date: string | null;
  rates: FxRate[];
  /** Currencies the dashboard actually plots, resolved from the full list. */
  selected: Record<string, number | null>;
  /** How far EUR has moved over a week, in percent. */
  eurWeekChangePercent: number | null;
  fetchedAt: number;
  stale: boolean;
  error: string | null;
};

/** One World Bank observation, newest year first. */
export type MacroSeriesPoint = {
  /** Year, as a string — the World Bank keys by year, not by date. */
  year: string;
  value: number | null;
};

export type MacroSeries = {
  indicatorId: string;
  label: string;
  country: string;
  points: MacroSeriesPoint[];
  /** Latest non-null value. */
  latest: number | null;
  latestYear: string | null;
  /**
   * Year-over-year percent change between the two most recent non-null points.
   * Null rather than 0 when a year is missing, because CPI rarely is not.
   */
  changePercent: number | null;
  fetchedAt: number;
  stale: boolean;
  error: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** One dated observation from a Frankfurter range response. */
export type FxPoint = { date: string; perUsd: number };

export function mapFxRates(payload: unknown): FxRate[] {
  const rates = asRecord(asRecord(payload).rates);
  return Object.entries(rates)
    .map(([currency, rate]): FxRate => ({
      currency,
      perUsd: toNumber(rate),
    }))
    .filter((rate): rate is FxRate => rate.perUsd !== null)
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * A Frankfurter **range** response nests one level deeper than the latest read.
 *
 * `/latest` gives `rates: { EUR: 0.89 }`, while a date range gives
 * `rates: { "2026-09-24": { EUR: 0.879 } }`. Reading the range with the single-read
 * mapper returns every currency as `null`, because each value is an object rather
 * than a number — a silent failure that looks exactly like "no FX data".
 */
export function mapFxRange(
  payload: unknown,
  currency: string,
): FxPoint[] {
  const rates = asRecord(asRecord(payload).rates);

  return Object.entries(rates)
    .map(([date, quote]): FxPoint | null => {
      const parsed = toNumber(asRecord(quote)[currency]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      if (parsed === null) return null;
      return { date, perUsd: parsed };
    })
    .filter((point): point is FxPoint => point !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Compares two Frankfurter reads to get a change.
 *
 * The ECB publishes on business days only, so a week-end query and a week-start
 * query legitimately span different numbers of publications. That is why the
 * comparison is against an explicit earlier date rather than against an assumed
 * offset.
 */
export function compareFx(
  current: Record<string, number | null>,
  previous: Record<string, number | null>,
  currency: string,
): number | null {
  const now = current[currency] ?? null;
  const then = previous[currency] ?? null;
  if (now === null || then === null || then === 0) return null;
  return ((now - then) / then) * 100;
}

export function mapWorldBankSeries(
  payload: unknown,
  meta: { indicatorId: string; label: string; country: string },
): MacroSeriesPoint[] {
  // The World Bank answers `[metadata, rows]`, and rows arrive newest-year-first.
  const rows = Array.isArray(payload) ? payload[1] : null;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => {
      const entry = asRecord(row);
      const year = entry.date;
      if (typeof year !== "string") return null;
      return { year, value: toNumber(entry.value) };
    })
    .filter((point): point is MacroSeriesPoint => point !== null)
    // Nulls are the World Bank's "no observation this year" and are common at
    // the recent end of the series, so they are kept in place rather than
    // dropped: removing them would make the gap invisible on a line chart.
    .sort((a, b) => Number(b.year) - Number(a.year));
}

/**
 * Year-over-year change from the two most recent *observed* points.
 *
 * Skipping nulls matters here: taking the literal previous year would give null
 * for the most recent observations, because the current year's CPI is rarely
 * published yet.
 */
export function latestChange(
  points: MacroSeriesPoint[],
): { latest: number | null; latestYear: string | null; changePercent: number | null } {
  const observed = points.filter(
    (point): point is MacroSeriesPoint & { value: number } => point.value !== null,
  );

  const latest = observed[0];
  if (observed.length === 0 || !latest) {
    return { latest: null, latestYear: null, changePercent: null };
  }

  const previous = observed[1];
  // With only one observation there is nothing to compare against, and dividing
  // by it would produce either NaN or a fabricated 0%.
  if (!previous) {
    return { latest: latest.value, latestYear: latest.year, changePercent: null };
  }

  return {
    latest: latest.value,
    latestYear: latest.year,
    changePercent: safeRatio(latest.value - previous.value, previous.value),
  };
}