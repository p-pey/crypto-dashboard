/**
 * Types owned by the analysis page's AI section.
 *
 * They live with the feature rather than with the AI layer on purpose: the AI
 * module knows nothing about countries, horizons or rial pressure, and adding a
 * section must never require editing it. If a second section needs something
 * from here, that is the signal the concept belongs in a shared module — not a
 * reason to move these up a layer.
 */

export type AnalyzeAiVerdict = "bullish" | "bearish" | "neutral";

export type AnalyzeAiFactor = {
  /** A macro aspect id from the digest, e.g. `monetary`. */
  aspect: string;
  /** Signed contribution to rial depreciation pressure, -100..100. */
  impact: number;
  /** A few words, not a sentence. */
  note: string;
};

/**
 * One point on the forward curve, as a chart needs it.
 *
 * Three fixed spans rather than whatever the model felt like naming, so the
 * panel can lay them out as a bar chart without parsing labels or sorting.
 */
export type AnalyzeAiHorizon = {
  /** Fixed span key: `d1`, `w1` or `m1`. */
  span: "d1" | "w1" | "m1";
  usdDriftPercent: number;
  goldDriftPercent: number;
  /** 0..100. The model may be more confident at one span than another. */
  confidence: number;
};

/**
 * The model's answer, exactly as validated.
 *
 * Provenance is deliberately absent: it is not something the model produces, it
 * is something {@link AiSectionResult} carries alongside the data, and merging
 * the two would let a prompt-injected field masquerade as a model id.
 */
export type AnalyzeAiOutput = {
  verdict: AnalyzeAiVerdict;
  /** 0..100. */
  confidence: number;
  /** One sentence: the call. */
  summary: string;
  /**
   * The chain of reasoning, two or three sentences.
   *
   * Kept separate from `summary` because they answer different questions and
   * are read at different times: `summary` is the call, `reasoning` is what it
   * rests on. Hard-capped, because a model left unconstrained will happily
   * write an essay here.
   */
  reasoning: string;
  /** Expected move over the selected horizon, in percent. */
  usdDriftPercent: number;
  goldDriftPercent: number;
  /** Chance of each direction over the horizon. Sums to 100. */
  probabilities: { up: number; flat: number; down: number };
  /** The forward curve, for the chart. */
  horizons: AnalyzeAiHorizon[];
  factors: AnalyzeAiFactor[];
  risks: string[];
};

/** What the panel renders: the answer plus where it came from. */
export type AnalyzeAiResult = AnalyzeAiOutput & {
  generatedAt: number;
  model: string | null;
  elapsedMs: number;
};

/**
 * Everything the model is allowed to reason over.
 *
 * Numbers, never sentences — see `buildUserPrompt` for why the headline text is
 * withheld.
 */
export type AnalyzeAiContext = {
  countryName: string;
  countryCode: string;
  horizonLabel: string;
  tone: number;
  risk: number;
  pressure: number;
  confidence: number;
  coverage: number;
  relevance: number;
  flowMomentum: number;
  headlines24h: number;
  /** Channel ids the model may name, taken from what actually had coverage. */
  aspects: string[];
  factors: {
    id: string;
    pressure: number;
    share: number;
    articles: number;
  }[];
  flow: { hoursAgo: number; tone: number; count: number }[];
  digest: {
    aspect: string | null;
    pressure: number;
    risk: number;
    hoursAgo: number;
    weight: number;
    source: string;
    title: string;
  }[];
  forecasts: {
    asset: string;
    driftPercent: number | null;
    band: { low: number; mid: number; high: number } | null;
    confidence: number | null;
    verdict: string;
  }[];
};
