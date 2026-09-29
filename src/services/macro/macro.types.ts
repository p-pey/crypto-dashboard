import type { MacroAsset } from "~/i18n/dictionaries/types";

export type Horizon = "hourly" | "daily" | "weekly" | "monthly" | "yearly";

export type SignalKey =
  | "newsSentiment"
  | "macroPressure"
  | "momentum1h"
  | "momentum12h"
  | "intradayRange"
  | "newsRecency"
  | "goldPremium";

/**
 * One input to the forecast. `score` is -100..100 and always signed as
 * *upward pressure on the rial*, so a positive score means the projected
 * Toman price of the dollar and of gold is expected to rise. `available` is
 * false when the underlying feed could not be read, in which case the signal
 * drops out of the weighted average instead of being counted as neutral.
 */
export type ForecastSignal = {
  key: SignalKey;
  score: number;
  available: boolean;
  detail: string;
};

export type ForecastBand = {
  low: number;
  mid: number;
  high: number;
};

export type HorizonForecast = {
  horizon: Horizon;
  /** Typical absolute move over the horizon, in percent. */
  volatilityPercent: number;
  band: ForecastBand | null;
  /** Expected percentage move over the horizon. */
  driftPercent: number;
  /** -100..100 composite of the signals that had data. */
  composite: number;
  /** 0..1. Multiplies the band width and widens the neutral threshold. */
  confidence: number;
  /** Share of the intended blend that had usable inputs, 0..1. */
  coverage: number;
  verdict: "bullish" | "bearish" | "neutral";
};

export type AssetForecast = {
  asset: MacroAsset;
  /** Instrument key on nerkh.io, e.g. `USD` or `GOLD18K`. */
  instrument: string;
  /** Current Toman price, or null when nerkh.io did not answer. */
  spot: number | null;
  byHorizon: HorizonForecast[];
  /** The horizon the panel shows first. */
  headline: HorizonForecast | null;
  signals: ForecastSignal[];
  /** Bullets explaining, in order of weight, what drove the projection. */
  rationale: string[];
  available: boolean;
};

export type MacroAnalysis = {
  generatedAt: number;
  forecasts: AssetForecast[];
  newsFetchedAt: number;
  priceFetchedAt: number;
  newsCoverage: number;
  /** `news:<id>` and `nerkh:<group>` entries for anything that failed. */
  unavailable: string[];
  stale: boolean;
  error: string | null;
};
