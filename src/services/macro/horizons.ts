import type { MacroAsset } from "~/i18n/dictionaries/types";

import type { Horizon } from "./macro.types";

/**
 * The horizon the panels lead with. Lives here rather than on the analysis
 * service so Client Components can import it without pulling the server side
 * crawlers into the browser bundle.
 */
export const HEADLINE_HORIZON: Horizon = "daily";

/** Order the horizon selector and the horizon cards are rendered in. */
export const HORIZON_ORDER: readonly Horizon[] = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

/**
 * Horizon calibration.
 *
 * `volatilityPercent` is a typical absolute move for the Iranian dollar and
 * gold market over the horizon, and is what turns the -100..100 composite into
 * a percentage. They are deliberately conservative for the long horizons: a
 * yearly number here is a direction, not a target.
 *
 * `confidenceFactor` scales the headline confidence down as the horizon
 * stretches out, because the same signal set is far less informative a year
 * ahead than it is an hour ahead.
 */
export const HORIZON_PROFILE: Record<
  Horizon,
  { volatilityPercent: number; confidenceFactor: number }
> = {
  hourly: { volatilityPercent: 0.7, confidenceFactor: 1 },
  daily: { volatilityPercent: 2.2, confidenceFactor: 0.85 },
  weekly: { volatilityPercent: 5.5, confidenceFactor: 0.62 },
  monthly: { volatilityPercent: 10, confidenceFactor: 0.45 },
  yearly: { volatilityPercent: 30, confidenceFactor: 0.25 },
};

/**
 * Signal blend per horizon and asset.
 *
 * Short horizons are mostly price momentum because headlines have barely been
 * digested; long horizons are mostly macro structure because momentum decays to
 * noise. Gold carries extra weight on the local premium and on gold demand,
 * since its Toman price is the dollar price multiplied by both.
 */
type Blend = Partial<Record<MacroAsset, Partial<Record<Horizon, number>>>>;

const BLEND: Record<string, Blend> = {
  newsSentiment: {
    usd: {
      hourly: 0.2,
      daily: 0.28,
      weekly: 0.24,
      monthly: 0.16,
      yearly: 0.12,
    },
    gold: {
      hourly: 0.2,
      daily: 0.26,
      weekly: 0.22,
      monthly: 0.14,
      yearly: 0.1,
    },
  },
  macroPressure: {
    usd: {
      hourly: 0.05,
      daily: 0.18,
      weekly: 0.34,
      monthly: 0.44,
      yearly: 0.58,
    },
    gold: {
      hourly: 0.05,
      daily: 0.16,
      weekly: 0.28,
      monthly: 0.34,
      yearly: 0.44,
    },
  },
  momentum1h: {
    usd: { hourly: 0.75, daily: 0.24, weekly: 0.05, monthly: 0, yearly: 0 },
    gold: { hourly: 0.75, daily: 0.24, weekly: 0.05, monthly: 0, yearly: 0 },
  },
  momentum12h: {
    usd: { hourly: 0, daily: 0.3, weekly: 0.24, monthly: 0.22, yearly: 0.1 },
    gold: { hourly: 0, daily: 0.28, weekly: 0.22, monthly: 0.2, yearly: 0.1 },
  },
  intradayRange: {
    // Range width is signed by where the price sits inside the window, so it
    // adds intraday information that a simple momentum does not carry.
    usd: { hourly: 0, daily: 0.14, weekly: 0.13, monthly: 0.12, yearly: 0.06 },
    gold: { hourly: 0, daily: 0.13, weekly: 0.12, monthly: 0.11, yearly: 0.05 },
  },
  newsRecency: {
    // A freshness gauge rather than a direction: it only ever dampens the
    // composite, so it is applied outside the weighted sum.
    usd: { hourly: 0, daily: 0, weekly: 0, monthly: 0, yearly: 0 },
    gold: { hourly: 0, daily: 0, weekly: 0, monthly: 0, yearly: 0 },
  },
  goldPremium: {
    usd: { hourly: 0, daily: 0, weekly: 0, monthly: 0, yearly: 0 },
    gold: { hourly: 0, daily: 0.09, weekly: 0.15, monthly: 0.21, yearly: 0.25 },
  },
};

/** Weights sum to 1 per (asset, horizon) row once unavailable signals are dropped. */
export const MACRO_ASSETS: readonly MacroAsset[] = ["usd", "gold"];

export function blendWeight(
  signal: string,
  asset: MacroAsset,
  horizon: Horizon,
): number {
  return BLEND[signal]?.[asset]?.[horizon] ?? 0;
}
