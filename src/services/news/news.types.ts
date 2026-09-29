import type { NewsCategory, NewsSourceId } from "~/constants/newsSources";

export type NewsArticle = {
  id: string;
  title: string;
  link: string;
  source: NewsSourceId;
  publishedAt: number;
  category: NewsCategory;
  /** Relevance of the article to the FX and gold drivers, 0..1. */
  relevance: number;
  /**
   * Macro tone of the headline, -1 ( appreciation pressure on the rial) ..
   * +1 (depreciation pressure). This is the *currency* reading, not a market
   * sentiment reading: sanctions news is negative for a currency, so it scores
   * positive here.
   */
  sentiment: number;
  /** Driver ids the headline matched, for the explainability panel. */
  matches: MacroDriverId[];
};

export type NewsFeedStatus = {
  source: NewsSourceId;
  ok: boolean;
  count: number;
  error: string | null;
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
};

export type NewsCrawlOptions = {
  /** Upper bound on articles kept per outlet. */
  perSource?: number;
  /** Articles older than this are dropped before scoring. */
  maxAgeMs?: number;
  force?: boolean;
};
