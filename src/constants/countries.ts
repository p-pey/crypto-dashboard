import type { NewsSourceId } from "./newsSources";

/**
 * The countries the analysis page can be scoped to.
 *
 * The crawler already pulls Iranian domestic wires, the Federal Reserve and the
 * US wires. Rather than running a second crawl per country, the same snapshot
 * is partitioned by the outlet each headline came from, so switching country is
 * an instant client side filter with no extra upstream load.
 *
 * `regional` is deliberately not a country: Al Jazeera, France 24 and SCMP are
 * mostly *about* the other two. They are folded into Iran by default, because
 * escalation risk in the region is the single largest driver of Iranian macro
 * headlines, while for the US the same feeds are mostly noise about other
 * people's economies. See `includeRegional` on each config.
 */
export type CountryId = "unitedStates" | "iran";

/** Which bucket an outlet belongs to. `regional` is shared context. */
export type SourceCountry = CountryId | "regional";

export type CountryConfig = {
  id: CountryId;
  /** Dictionary key for the country name shown in the UI. */
  labelKey: "country.unitedStates" | "country.iran";
  /** ISO 3166-1 alpha-2, for the flag glyph and for tooltips. */
  code: string;
  flag: string;
  /** Native currency, shown next to the country's scorecard. */
  currency: string;
  /** Outlets that report this country's own economy. */
  sources: readonly NewsSourceId[];
  /** Whether the regional wires are treated as part of this country's picture. */
  includeRegional: boolean;
  /** Chart accent, kept in sync with the country selector. */
  accent: string;
};

/**
 * Every outlet maps to exactly one bucket. Kept as a lookup rather than read
 * off the source config so a new outlet cannot be silently unassigned.
 */
export const SOURCE_COUNTRY: Record<NewsSourceId, SourceCountry> = {
  mehr: "iran",
  irna: "iran",
  isna: "iran",
  khabaronline: "iran",
  tehrantimes: "iran",

  fed: "unitedStates",
  fedMonetary: "unitedStates",
  cnbcEconomy: "unitedStates",
  cnbcTop: "unitedStates",
  marketwatch: "unitedStates",
  wsjMarkets: "unitedStates",

  aljazeera: "regional",
  france24: "regional",
  scmp: "regional",
};

export const COUNTRIES: readonly CountryConfig[] = [
  {
    id: "unitedStates",
    labelKey: "country.unitedStates",
    code: "US",
    flag: "\u{1F1FA}\u{1F1F8}",
    currency: "USD",
    sources: [
      "fed",
      "fedMonetary",
      "cnbcEconomy",
      "cnbcTop",
      "marketwatch",
      "wsjMarkets",
    ],
    includeRegional: false,
    accent: "var(--cyan)",
  },
  {
    id: "iran",
    labelKey: "country.iran",
    code: "IR",
    flag: "\u{1F1EE}\u{1F1F7}",
    currency: "IRR",
    sources: ["mehr", "irna", "isna", "khabaronline", "tehrantimes"],
    includeRegional: true,
    accent: "var(--mint)",
  },
];

export const COUNTRY_IDS: readonly CountryId[] = COUNTRIES.map(
  (country) => country.id,
);

/**
 * The US goes first: the Fed and the US wires are the upstream drivers of the
 * dollar that the rial is priced against, so they are the better default lens.
 */
export const DEFAULT_COUNTRY: CountryId = "unitedStates";

const BY_ID = new Map<CountryId, CountryConfig>(
  COUNTRIES.map((country) => [country.id, country]),
);

export function countryConfig(id: CountryId): CountryConfig {
  return BY_ID.get(id) ?? COUNTRIES[0]!;
}

/** True when a headline from this outlet belongs in the country's reading. */
export function countryIncludes(
  id: CountryId,
  sourceCountry: SourceCountry,
): boolean {
  if (sourceCountry === id) return true;
  return sourceCountry === "regional" && countryConfig(id).includeRegional;
}
