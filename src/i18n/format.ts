import { LOCALE_META, type Locale } from "./config";
import type { Dictionary } from "./dictionaries/types";

/**
 * Locale aware formatting. Pure, isomorphic and free of React so it can be
 * called from Server Components, Client Components, route handlers and the
 * server side tRPC routers alike.
 *
 * Persian resolves to `fa-IR`, which means `Intl` hands back Persian digits
 * (۰۱۲۳), Persian thousands separators (٬) and — on ICU builds with the
 * `persian` calendar enabled — Jalali dates, all without extra work here.
 */

export function intlLocale(locale: Locale): string {
  return LOCALE_META[locale].intl;
}

const numberCache = new Map<string, Intl.NumberFormat>();

function numberFormat(
  locale: Locale,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let cached = numberCache.get(key);
  if (!cached) {
    cached = new Intl.NumberFormat(intlLocale(locale), options);
    numberCache.set(key, cached);
  }
  return cached;
}

export function formatNumber(
  locale: Locale,
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return numberFormat(locale, {
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
}

export function formatCompact(
  locale: Locale,
  value: number | null | undefined,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return numberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatSigned(
  locale: Locale,
  value: number | null | undefined,
  digits = 2,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const formatted = formatNumber(locale, value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
  });
  return value > 0 ? `+${formatted}` : formatted;
}

export function formatPercent(
  locale: Locale,
  value: number | null | undefined,
  digits = 2,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return numberFormat(locale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value / 100);
}

/** Signed percentage, e.g. `+2.41%` / `‎+۲٫۴۱٪`. */
export function formatSignedPercent(
  locale: Locale,
  value: number | null | undefined,
  digits = 2,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const formatted = numberFormat(locale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
  }).format(value / 100);
  return value > 0 ? `+${formatted}` : formatted;
}

const dateCache = new Map<string, Intl.DateTimeFormat>();

function dateFormat(
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let cached = dateCache.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(intlLocale(locale), options);
    dateCache.set(key, cached);
  }
  return cached;
}

function toDate(value: number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type TimeOptions = {
  withSeconds?: boolean;
  /** Defaults to the runtime timezone; pass `"UTC"` for the terminal clock. */
  timeZone?: string;
};

export function formatTime(
  locale: Locale,
  value: number | Date | null | undefined,
  options: TimeOptions = {},
): string {
  const date = toDate(value);
  if (!date) return "—";
  return dateFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...(options.withSeconds ? { second: "2-digit" as const } : {}),
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date);
}

export function formatDateTime(
  locale: Locale,
  value: number | Date | null | undefined,
): string {
  const date = toDate(value);
  if (!date) return "—";
  return dateFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(
  locale: Locale,
  value: number | Date | null | undefined,
): string {
  const date = toDate(value);
  if (!date) return "—";
  return dateFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.34524],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY],
];

export function formatRelative(
  locale: Locale,
  value: number | Date | null | undefined,
  now = Date.now(),
): string {
  const date = toDate(value);
  if (!date) return "—";

  const deltaSeconds = (date.getTime() - now) / 1000;
  const formatter = new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: "auto",
  });

  let unit: Intl.RelativeTimeFormatUnit = "second";
  let amount = deltaSeconds;

  for (const [candidate, span] of RELATIVE_UNITS) {
    unit = candidate;
    amount = deltaSeconds / span;
    if (Math.abs(amount) < 1) break;
  }

  return formatter.format(Math.round(amount), unit);
}

/** Fills a `ریال` style template. Every placeholder in the dictionaries is `%s`. */
export function interpolate(
  template: string,
  ...args: (string | number)[]
): string {
  let index = 0;
  return template.replace(/%s/g, () => String(args[index++] ?? ""));
}

/**
 * The currency unit for a price is carried in the dictionary rather than by
 * `Intl` so that a Toman quote never renders as "IRR".
 */
export function formatMoney(
  locale: Locale,
  dictionary: Dictionary,
  value: number | null | undefined,
  unit: "toman" | "rial",
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${formatNumber(locale, value, {
    maximumFractionDigits: 0,
    ...options,
  })} ${dictionary.nerkh.units[unit]}`;
}
