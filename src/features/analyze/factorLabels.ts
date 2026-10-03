import type { TranslationKey } from "~/i18n/dictionaries/types";

/**
 * Macro channels arrive as a bare id — one of the eight driver ids from the
 * news lexicon, or `aspect:<id>` for a dominant per-headline aspect — and both
 * sets already have labels in the dictionary. Resolving them here keeps every
 * chart and bar reading from the same translated names.
 */
const DRIVER_KEYS: Record<string, TranslationKey> = {
  fx_market: "analyze.drivers.fxMarket",
  inflation: "analyze.drivers.inflation",
  monetary: "analyze.drivers.monetary",
  sanctions: "analyze.drivers.sanctions",
  oil_energy: "analyze.drivers.oilEnergy",
  budget: "analyze.drivers.budget",
  gold_demand: "analyze.drivers.goldDemand",
  political_risk: "analyze.drivers.politicalRisk",
};

const ASPECT_PREFIX = "aspect:";

export function factorKey(id: string): TranslationKey | null {
  if (id.startsWith(ASPECT_PREFIX)) {
    return `news.aspect.${id.slice(ASPECT_PREFIX.length)}` as TranslationKey;
  }
  return DRIVER_KEYS[id] ?? null;
}

/**
 * Pressure is signed as depreciation pressure on the rial, so a positive bar
 * is always the same colour even though the channel labels differ.
 */
export function pressureColor(pressure: number): string {
  if (Math.abs(pressure) < 3) return "var(--text-3)";
  return pressure > 0 ? "var(--down)" : "var(--up)";
}
