import {
  COUNTRY_IDS,
  countryConfig,
  countryIncludes,
} from "~/constants/countries";
import type { CountryId } from "~/constants/countries";

import type { NewsArticle, NewsStance } from "~/services/news/news.types";

/**
 * One hour of the news flow, for the tone-over-time chart.
 *
 * `hoursAgo` counts backwards from now, so index 0 is the current hour and the
 * series reads right to left on an RTL locale without a second dataset.
 */
export type EconomyFlowBucket = {
  hoursAgo: number;
  tone: number;
  risk: number;
  count: number;
};

/**
 * One macro channel, with its share of the country's headline volume.
 *
 * `pressure` is signed as *depreciation pressure on the rial* (-100..100),
 * matching every other score in the app. `share` is 0..1 of the articles that
 * matched this channel, so a factor can be read as "how much of the story".
 */
export type EconomyFactor = {
  id: string;
  pressure: number;
  articles: number;
  /** 0..1 of the country's matched articles. */
  share: number;
};

export type EconomyHistogramBin = {
  /** Inclusive lower edge of the bucket, -1..1. */
  from: number;
  count: number;
};

export type CountryEconomy = {
  country: CountryId;
  code: string;
  currency: string;
  accent: string;
  generatedAt: number;
  /** 0..1 share of the country's configured feed weight that answered. */
  coverage: number;
  /** Articles attributed to this country in the snapshot. */
  headlines: number;
  /** Those published in the last 24 hours. */
  headlines24h: number;
  /** 0..1 share of the country's articles that hit a macro term. */
  relevance: number;
  /** Headline count in the last 6h against the 6h before it, -1..1. */
  flowMomentum: number;
  /** Recency weighted depreciation pressure, -100..100. */
  tone: number;
  /** Recency weighted global risk appetite, -100..100. */
  risk: number;
  /** Mean of the country's matched macro channels, -100..100. */
  pressure: number;
  /** 0..100. Falls when coverage or relevance is thin. */
  confidence: number;
  flow: EconomyFlowBucket[];
  factors: EconomyFactor[];
  stance: Record<NewsStance, number>;
  histogram: EconomyHistogramBin[];
  /** Highest relevance, most recent first, for the compact feed. */
  top: NewsArticle[];
  /** The same headline set, for the local LLM prompt. */
  digest: CountryEconomyDigest[];
  peers: {
    country: CountryId;
    tone: number;
    risk: number;
    headlines: number;
    coverage: number;
  }[];
};

/**
 * One headline, flattened for the model.
 *
 * The scores come first and the text last, on purpose. The text is there — a
 * model asked to judge economic news needs to know what the news *says*, and a
 * bare number tells it nothing about whether the outlet is reporting a decision
 * or a rumour — but every headline carries its own magnitudes, so the model can
 * weigh a mild story with a large score against a dramatic one with a small
 * score instead of reacting to whichever sentence reads loudest.
 */
export type CountryEconomyDigest = {
  aspect: string | null;
  /** Rial depreciation pressure, -100..100. */
  pressure: number;
  /** Global risk appetite, -100..100. */
  risk: number;
  hoursAgo: number;
  /** How macro-relevant the headline was judged, 0..1. */
  weight: number;
  source: string;
  title: string;
};

export const FLOW_HOURS = 24;
export const HISTOGRAM_BINS = 9;
/**
 * Headlines sent to the model.
 *
 * Bounded by cost, not by taste: a CPU-only runtime generates at a few tokens a
 * second, so every headline is roughly ten tokens of prompt and prefill is the
 * expensive half. Forty is the point where the tail stops changing the verdict.
 */
export const DIGEST_LIMIT = 30;
/** Channels shown on the factor panel; more than this is noise, not detail. */
const FACTOR_LIMIT = 10;
/** Mirrors `ASPECT_PREFIX` in the feature layer, which labels these ids. */
const ASPECT_PREFIX = "aspect:";

/** Older than this and a headline is history, not flow. */
const WINDOW_MS = 24 * 3_600_000;

/**
 * `0.5^(hours / 8)`: an 8 hour old article counts half as much as a fresh one,
 * while the whole day stays in play. Identical to the crawler's own weighting,
 * so the country figures and the headline figures agree.
 */
export function recencyWeight(publishedAt: number, now: number): number {
  const hours = Math.max(0, (now - publishedAt) / 3_600_000);
  return Math.pow(0.5, hours / 8);
}

export function articlesForCountry(
  articles: NewsArticle[],
  country: CountryId,
): NewsArticle[] {
  const set = new Set<string>(countryConfig(country).sources);
  return articles.filter((article) => {
    if (set.has(article.source)) return true;
    return countryIncludes(country, article.country);
  });
}

/**
 * Projects one country's economic picture out of the crawled snapshot.
 *
 * Every number here is derived from scored headlines, so the scorecard is a
 * read of the news rather than a second opinion on it: `pressure` is the mean
 * of the aspects that actually had coverage, and `confidence` is deliberately
 * harsh — it is the share of feeds that answered *and* the share of articles
 * that hit a macro term, because a feed that is merely loud is not an informed
 * signal.
 */
export function buildCountryEconomy(input: {
  country: CountryId;
  articles: NewsArticle[];
  sourceWeights: {
    source: string;
    weight: number;
    ok: boolean;
    count: number;
  }[];
  now: number;
}): CountryEconomy {
  const config = countryConfig(input.country);
  const scoped = articlesForCountry(input.articles, input.country);
  const windowStart = input.now - WINDOW_MS;

  const inWindow = scoped.filter((a) => a.publishedAt >= windowStart);
  const weightOf = new Map(
    input.sourceWeights.map((s) => [s.source, s.weight] as const),
  );

  const totalWeight = config.sources.reduce(
    (sum, id) => sum + (weightOf.get(id) ?? 1),
    0,
  );
  const liveWeight = config.sources.reduce((sum, id) => {
    const status = input.sourceWeights.find((s) => s.source === id);
    return sum + (status?.ok && status.count > 0 ? (status.weight ?? 1) : 0);
  }, 0);
  const coverage = totalWeight === 0 ? 0 : liveWeight / totalWeight;

  const relevant = inWindow.filter((a) => a.relevance > 0).length;
  const relevance = inWindow.length === 0 ? 0 : relevant / inWindow.length;

  const scored = inWindow.filter((a) => a.relevance > 0);
  const tone = weightedMean(
    inWindow,
    (a) => a.sentiment,
    input.now,
    (a) => a.relevance,
  );
  const risk = weightedMean(inWindow, (a) => a.riskScore, input.now);

  const factors = buildFactors(scored, input.now);
  const pressure =
    factors.length === 0
      ? 0
      : clamp(
          factors.reduce((sum, f) => sum + f.pressure, 0) / factors.length,
          -100,
          100,
        );

  // Headline volume is a real signal — a quiet country is not a calm one — but
  // it needs two full windows to read, so a short history reports zero rather
  // than a confident-looking ratio built on two articles.
  const recentCut = input.now - 6 * 3_600_000;
  const previousCut = input.now - 12 * 3_600_000;
  const recent = inWindow.filter((a) => a.publishedAt >= recentCut).length;
  const previous = inWindow.filter(
    (a) => a.publishedAt >= previousCut && a.publishedAt < recentCut,
  ).length;
  const flowMomentum =
    recent + previous < 4
      ? 0
      : clamp((recent - previous) / Math.max(1, previous), -1, 1);

  const confidence = clamp(
    Math.round(
      coverage * 100 * 0.5 +
        relevance * 100 * 0.3 +
        Math.min(1, inWindow.length / 30) * 100 * 0.2,
    ),
    0,
    100,
  );

  return {
    country: input.country,
    code: config.code,
    currency: config.currency,
    accent: config.accent,
    generatedAt: input.now,
    coverage,
    headlines: scoped.length,
    headlines24h: inWindow.length,
    relevance,
    flowMomentum,
    tone: round(tone),
    risk: round(risk),
    pressure: round(pressure),
    confidence,
    flow: buildFlow(inWindow, input.now),
    factors,
    stance: buildStance(inWindow),
    histogram: buildHistogram(inWindow),
    top: [...inWindow]
      .sort(
        (a, b) => b.relevance - a.relevance || b.publishedAt - a.publishedAt,
      )
      .slice(0, 8),
    digest: buildDigest(scored, input.now),
    peers: COUNTRY_IDS.map((id) => {
      const peer = articlesForCountry(input.articles, id);
      const peerWindow = peer.filter((a) => a.publishedAt >= windowStart);
      const peerTotal = countryConfig(id).sources.reduce(
        (sum, s) => sum + (weightOf.get(s) ?? 1),
        0,
      );
      const peerLive = countryConfig(id).sources.reduce((sum, s) => {
        const status = input.sourceWeights.find((x) => x.source === s);
        return (
          sum + (status?.ok && status.count > 0 ? (status.weight ?? 1) : 0)
        );
      }, 0);
      return {
        country: id,
        tone: round(
          weightedMean(
            peerWindow,
            (a) => a.sentiment,
            input.now,
            (a) => a.relevance,
          ),
        ),
        risk: round(weightedMean(peerWindow, (a) => a.riskScore, input.now)),
        headlines: peerWindow.length,
        coverage: peerTotal === 0 ? 0 : peerLive / peerTotal,
      };
    }),
  };
}

/**
 * The macro aspects this country's news is actually about, ranked by reach.
 *
 * Only one taxonomy is used. The crawler also scores eight "drivers", but they
 * overlap the aspects almost one for one — `monetary` against `aspect:monetary`
 * would put two identically labelled rows on the chart — and the aspects are the
 * set that covers war, equities and credit, which have no driver at all. The
 * driver scores stay where they belong, inside the price forecast.
 *
 * Each headline carries exactly one aspect, so the shares sum to at most 1 and
 * a row's `share` reads as "this much of the country's news touches this".
 */
function buildFactors(scored: NewsArticle[], now: number): EconomyFactor[] {
  const buckets = new Map<
    string,
    { weighted: number; weight: number; articles: number }
  >();

  for (const article of scored) {
    if (!article.aspect) continue;
    // Aspect terms are signed on the same -1..1 axis as the drivers but have
    // not been scaled to an index yet, so the ×100 is what puts them in step
    // with every other pressure figure in the app.
    const weight = recencyWeight(article.publishedAt, now) * article.relevance;
    if (weight === 0) continue;

    const bucket = buckets.get(article.aspect) ?? {
      weighted: 0,
      weight: 0,
      articles: 0,
    };
    bucket.weighted += article.sentiment * 100 * weight;
    bucket.weight += weight;
    bucket.articles += 1;
    buckets.set(article.aspect, bucket);
  }

  const total = Math.max(1, scored.length);
  return [...buckets.entries()]
    .map(([aspect, bucket]) => ({
      id: `${ASPECT_PREFIX}${aspect}`,
      pressure: round(bucket.weighted / bucket.weight),
      articles: bucket.articles,
      share: share(bucket.articles / total),
    }))
    .sort(
      (a, b) =>
        b.articles - a.articles || Math.abs(b.pressure) - Math.abs(a.pressure),
    )
    .slice(0, FACTOR_LIMIT);
}

function buildFlow(articles: NewsArticle[], now: number): EconomyFlowBucket[] {
  const buckets: EconomyFlowBucket[] = Array.from(
    { length: FLOW_HOURS },
    (_, i) => ({
      hoursAgo: FLOW_HOURS - 1 - i,
      tone: 0,
      risk: 0,
      count: 0,
    }),
  );

  for (const article of articles) {
    const hoursAgo = Math.floor((now - article.publishedAt) / 3_600_000);
    if (hoursAgo < 0 || hoursAgo >= FLOW_HOURS) continue;
    const bucket = buckets[FLOW_HOURS - 1 - hoursAgo];
    if (!bucket) continue;
    bucket.count += 1;
    const weight = recencyWeight(article.publishedAt, now);
    bucket.tone += article.sentiment * weight * article.relevance;
    bucket.risk += article.riskScore * weight;
  }

  // A lone headline in an hour should read as a faint blip, not a crisis, so the
  // per-bucket total is divided by the recency weight a full-strength hour
  // would have accumulated.
  for (const bucket of buckets) {
    if (bucket.count === 0) continue;
    bucket.tone = round(clamp(Math.tanh(bucket.tone / 1.5) * 100, -100, 100));
    bucket.risk = round(
      clamp(bucket.risk / Math.max(1, bucket.count), -100, 100),
    );
  }

  return buckets;
}

function buildStance(articles: NewsArticle[]): Record<NewsStance, number> {
  const out: Record<NewsStance, number> = {
    risk_on: 0,
    risk_off: 0,
    neutral: 0,
  };
  for (const article of articles) out[article.stance] += 1;
  return out;
}

function buildHistogram(articles: NewsArticle[]): EconomyHistogramBin[] {
  const width = 2 / HISTOGRAM_BINS;
  const bins: EconomyHistogramBin[] = Array.from(
    { length: HISTOGRAM_BINS },
    (_, i) => ({ from: round(-1 + i * width), count: 0 }),
  );

  for (const article of articles) {
    if (article.relevance === 0) continue;
    const index = Math.min(
      HISTOGRAM_BINS - 1,
      Math.max(0, Math.floor(((article.sentiment + 1) / 2) * HISTOGRAM_BINS)),
    );
    bins[index]!.count += 1;
  }

  return bins;
}

function buildDigest(
  articles: NewsArticle[],
  now: number,
): CountryEconomyDigest[] {
  return (
    [...articles]
      // Strongest and freshest first, so a truncated list still carries the story.
      .sort(
        (a, b) =>
          b.relevance - a.relevance ||
          recencyWeight(b.publishedAt, now) - recencyWeight(a.publishedAt, now),
      )
      .slice(0, DIGEST_LIMIT)
      .map((article) => ({
        aspect: article.aspect,
        pressure: Math.round(article.sentiment * 100),
        risk: article.riskScore,
        hoursAgo: Math.round((now - article.publishedAt) / 3_600_000),
        weight: Math.round(article.relevance * 100) / 100,
        source: article.source,
        title: article.title,
      }))
  );
}

function weightedMean(
  articles: NewsArticle[],
  pick: (article: NewsArticle) => number,
  now: number,
  gate?: (article: NewsArticle) => number,
): number {
  let total = 0;
  let weight = 0;
  for (const article of articles) {
    const w = recencyWeight(article.publishedAt, now) * (gate?.(article) ?? 1);
    if (w === 0) continue;
    total += pick(article) * w;
    weight += w;
  }
  if (weight === 0) return 0;
  // `tanh` rather than a hard clamp: a sanctions-dominated hour should read
  // strongly without pinning at the rail and losing all resolution.
  return Math.tanh(total / weight / 12) * 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Rounded, with negative zero folded to zero.
 *
 * `Math.round` returns `-0` for small negatives, and JSON has no negative zero,
 * so a value that reaches the browser as `-0` comes back as the string `"-0"`
 * and breaks anything that expects a number.
 */
function round(value: number): number {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

/** Two decimals, same `-0` guard as `round`. */
function share(value: number): number {
  const scaled = Math.round(value * 100) / 100;
  return scaled === 0 ? 0 : scaled;
}
