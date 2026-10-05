import {
  Activity,
  CandlestickChart,
  ChartColumnIncreasing,
  ChartPie,
  Compass,
  Droplets,
  LineChart,
  ShieldCheck,
  type LucideIcon,
  Zap,
} from "lucide-react";

import { isLocale, withLocale, type Locale } from "~/i18n/config";
import type { NavKey } from "~/i18n/dictionaries/types";

/**
 * Navigation is stored locale free: `href` is the canonical path and the
 * label/hint pair is looked up in the dictionary, so adding a language never
 * means touching this file. {@link navPathname} and {@link navHref} are the two
 * helpers that translate between the two representations.
 */
export type NavItem = {
  key: NavKey;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "markets", href: "/", icon: ChartPie },
  { key: "trade", href: "/trade", icon: Zap },
  { key: "derivatives", href: "/derivatives", icon: Activity },
  { key: "etfs", href: "/etfs", icon: CandlestickChart },
  { key: "irPrice", href: "/ir-price", icon: Droplets },
  { key: "analyze", href: "/analyze", icon: LineChart },
  { key: "charts", href: "/charts", icon: ChartColumnIncreasing },
  { key: "insights", href: "/insights", icon: Compass },
  { key: "safety", href: "/safety", icon: ShieldCheck },
];

/** Longest prefix first so `/ir-price` cannot swallow a hypothetical `/ir-price-x`. */
const MATCH_ORDER = [...NAV_ITEMS].sort(
  (a, b) => b.href.length - a.href.length,
);

/** Resolves a locale-stripped pathname to its nav item, if any. */
export function navKeyForPathname(pathname: string): NavKey | undefined {
  return MATCH_ORDER.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
  )?.key;
}

export function navHref(locale: Locale, pathname: string): string {
  return withLocale(locale, pathname);
}

/** Strips `/<locale>` from a `usePathname()` result so nav matching is exact. */
export function navPathname(pathname: string): string {
  const [, first, ...rest] = pathname.split("/");
  if (first && isLocale(first)) {
    const remainder = rest.join("/");
    return remainder ? `/${remainder}` : "/";
  }
  return pathname;
}
