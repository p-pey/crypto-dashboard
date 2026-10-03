import type { NewsSourceId } from "~/constants/newsSources";
import type { SourceCountry } from "~/constants/countries";

/**
 * What a headline is *about*.
 *
 * `rialImpact` is the direction the rial is pushed by that aspect, and
 * `riskImpact` is the direction of global risk appetite. They are signed
 * independently because they routinely disagree: a Fed rate cut is risk-on
 * globally (riskImpact +) while still weakening the rial against the dollar
 * (rialImpact +). Reading one number for "good news" is what makes most news
 * dashboards useless, so both are reported.
 */
export type NewsAspect =
  | "fx"
  | "gold"
  | "oil"
  | "inflation"
  | "monetary"
  | "sanctions"
  | "budget"
  | "war"
  | "politics"
  | "credit"
  | "equities"
  | "crypto";

export type NewsStance = "risk_on" | "risk_off" | "neutral";

export type NewsArticle = {
  id: string;
  title: string;
  link: string;
  source: NewsSourceId;
  /** Which country's economy this headline speaks to. */
  country: SourceCountry;
  tier: "iran" | "usOfficial" | "usWires" | "regional";
  publishedAt: number;
  category: "macro" | "markets" | "politics" | "other";
  /** Relevance to the FX and gold drivers, 0..1. */
  relevance: number;
  /**
   * Rial depreciation pressure, -1 (appreciation) .. +1 (depreciation). A
   * positive reading means the dollar and gold in Toman are expected to rise.
   */
  sentiment: number;
  /** Driver ids the headline matched, for the explainability panel. */
  matches: MacroDriverId[];
  /** The dominant aspect, or null when nothing was recognised. */
  aspect: NewsAspect | null;
  /**
   * Direction the dominant aspect pushes the rial, which the client turns into
   * a localized sentence. Kept as an enum rather than a sentence so the string
   * is never baked in one language on the server.
   */
  result: "up" | "down" | "flat" | null;
  stance: NewsStance;
  /** Global risk appetite, -100 (risk-off) .. +100 (risk-on). */
  riskScore: number;
};

export type NewsFeedStatus = {
  source: NewsSourceId;
  country: SourceCountry;
  /** Vote share of this outlet in the composite, from the source config. */
  weight: number;
  ok: boolean;
  count: number;
  error: string | null;
  tier: "iran" | "usOfficial" | "usWires" | "regional";
};

/**
 * The eight macro channels the analyser scores. The composite `score` is
 * signed as *depreciation pressure on the rial*, so a positive reading means
 * the rial is expected to weaken and the dollar and gold in Toman to rise.
 */
export type MacroDriverId =
  | "fx_market"
  | "inflation"
  | "monetary"
  | "sanctions"
  | "oil_energy"
  | "budget"
  | "gold_demand"
  | "political_risk";

export type MacroDriverReading = {
  id: MacroDriverId;
  /** -100..100 depreciation pressure, already weighted by source strength. */
  score: number;
  /** Number of articles that contributed. */
  articles: number;
  available: boolean;
  detail: string;
};

export type NewsSnapshot = {
  articles: NewsArticle[];
  fetchedAt: number;
  sources: NewsFeedStatus[];
  unavailable: NewsSourceId[];
  /** True when an older snapshot was served after a failed refresh. */
  stale: boolean;
  error: string | null;
  drivers: MacroDriverReading[];
  /** Share of the configured source weight that answered, 0..1. */
  coverage: number;
  /** Recency weighted composite of article tone, -100..100. */
  aggregate: number;
  /**
   * Share of the weight, by tier, that produced at least one article. This is
   * what tells you whether a sector of the crawl is simply silent or broken.
   */
  tierCoverage: Record<"iran" | "usOfficial" | "usWires" | "regional", number>;
  /** Recency weighted global risk appetite, -100 (risk-off) .. +100. */
  riskAggregate: number;
};

export type NewsCrawlOptions = {
  /** Upper bound on articles kept per outlet. */
  perSource?: number;
  /** Articles older than this are dropped before scoring. */
  maxAgeMs?: number;
  force?: boolean;
};
