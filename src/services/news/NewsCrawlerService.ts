import {
  BROWSER_UA,
  NEWS_SOURCES,
  type NewsSourceId,
  type NewsTier,
} from "~/constants/newsSources";
import { AxiosService } from "~/lib/axios";
import { AppInject, AppSignleton } from "~/lib/container";

import { DRIVER_IDS, dedupeArticles, mapFeed } from "./news.mapper";
import { MACRO_LEXICON } from "./macro.lexicon";
import type {
  MacroDriverId,
  MacroDriverReading,
  NewsArticle,
  NewsCrawlOptions,
  NewsFeedStatus,
  NewsSnapshot,
} from "./news.types";

/** Aggregators publish in bursts; five minutes keeps the panel fresh enough. */
export const NEWS_TTL_MS = 5 * 60_000;

/** Articles older than a day have no bearing on an intraday forecast. */
const MAX_ARTICLE_AGE_MS = 30 * 60 * 60_000;

const PER_SOURCE = 30;

/** Cap on headlines held in memory, so a noisy tier cannot crowd out the rest. */
const MAX_ARTICLES = 400;

const FEED_HEADERS: Record<string, string> = {
  Accept:
    "application/rss+xml, application/xml, text/xml, application/atom+xml;q=0.9, */*;q=0.8",
  "Accept-Language": "fa,en;q=0.8",
  "User-Agent": BROWSER_UA,
};

const TIERS: NewsTier[] = ["iran", "usOfficial", "usWires", "regional"];

type Cached = { snapshot: NewsSnapshot; expiresAt: number };

/**
 * Aggregates Iranian, US official, US wires and regional feeds, then turns them
 * into a macro reading.
 *
 * Every outlet is fetched independently and concurrently, so one dead feed
 * costs only its own share of the coverage figure. Coverage is also reported
 * per tier, which is what tells you whether the Iranian press went quiet or the
 * whole tier is broken. The composite score is recency and relevance weighted;
 * there is no model and no API key, so every number traces back to a headline.
 */
@AppSignleton()
export default class NewsCrawlerService {
  private cache: Cached | null = null;
  private inflight: Promise<NewsSnapshot> | null = null;

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {}

  async getSnapshot(options: NewsCrawlOptions = {}): Promise<NewsSnapshot> {
    if (!options.force && this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.snapshot;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.crawl(options).finally(() => {
      this.inflight = null;
    });

    return this.inflight;
  }

  private async crawl(options: NewsCrawlOptions): Promise<NewsSnapshot> {
    const now = Date.now();
    const perSource = options.perSource ?? PER_SOURCE;
    const maxAgeMs = options.maxAgeMs ?? MAX_ARTICLE_AGE_MS;

    const settled = await Promise.all(
      NEWS_SOURCES.map(async (source): Promise<ScoredEntry> => {
        try {
          const xml = await this.fetchFeed(source.feedUrl);
          const articles = mapFeed(source, xml, { perSource, now, maxAgeMs });
          return {
            source: source.id,
            tier: source.tier,
            status: {
              source: source.id,
              tier: source.tier,
              ok: articles.length > 0,
              count: articles.length,
              // An empty result is usually a stale feed rather than an outage,
              // so say which of the two it was.
              error:
                articles.length > 0
                  ? null
                  : "no articles inside the time window",
            },
            articles,
            weight: source.weight,
          };
        } catch (error) {
          return {
            source: source.id,
            tier: source.tier,
            status: {
              source: source.id,
              tier: source.tier,
              ok: false,
              count: 0,
              error: describeError(error),
            },
            articles: [],
            weight: source.weight,
          };
        }
      }),
    );

    const sources = settled.map((entry) => entry.status);
    const articles = dedupeArticles(
      settled
        .flatMap((entry) => entry.articles)
        .sort((a, b) => b.publishedAt - a.publishedAt),
    ).slice(0, MAX_ARTICLES);

    const unavailable = settled
      .filter((entry) => !entry.status.ok)
      .map((entry) => entry.source);

    if (articles.length === 0) {
      const message =
        settled.map((entry) => entry.status.error).find(Boolean) ??
        "no headlines retrieved";
      const previous = this.cache?.snapshot;
      if (previous && previous.articles.length > 0) {
        return { ...previous, stale: true, error: message };
      }
      return emptySnapshot(message);
    }

    const totalWeight = NEWS_SOURCES.reduce((sum, s) => sum + s.weight, 0);
    // A reachable feed that yielded nothing inside the time window did not
    // actually inform the model, so it must not inflate the coverage figure.
    const liveWeight = settled
      .filter((entry) => entry.status.ok && entry.articles.length > 0)
      .reduce((sum, entry) => sum + entry.weight, 0);

    const snapshot: NewsSnapshot = {
      articles,
      fetchedAt: now,
      sources,
      unavailable,
      stale: false,
      error: null,
      drivers: scoreDrivers(articles, settled),
      coverage: liveWeight / totalWeight,
      aggregate: aggregateTone(articles, now),
      tierCoverage: tierCoverage(settled),
      riskAggregate: aggregateRisk(articles, now),
    };

    this.cache = { snapshot, expiresAt: now + NEWS_TTL_MS };
    return snapshot;
  }

  private async fetchFeed(url: string): Promise<string> {
    const { data } = await this.http.get<string>(url, {
      headers: FEED_HEADERS,
      timeout: 10_000,
      responseType: "text",
      maxRedirects: 3,
    });

    if (typeof data !== "string") {
      throw new Error("feed did not return a document");
    }
    return data;
  }
}

/**
 * A headline is worth less the older it is: `0.5^(ageHours / 8)` puts a
 * 8 hour old article at half weight while keeping the whole day's feed in play.
 */
function recencyWeight(publishedAt: number, now: number): number {
  const hours = Math.max(0, (now - publishedAt) / 3_600_000);
  return Math.pow(0.5, hours / 8);
}

type ScoredEntry = {
  source: NewsSourceId;
  tier: NewsTier;
  articles: NewsArticle[];
  weight: number;
  status: NewsFeedStatus;
};

function scoreDrivers(
  articles: NewsArticle[],
  entries: ScoredEntry[],
): MacroDriverReading[] {
  const byId = new Map<MacroDriverId, NewsArticle[]>();
  for (const article of articles) {
    for (const driver of article.matches) {
      const bucket = byId.get(driver) ?? [];
      bucket.push(article);
      byId.set(driver, bucket);
    }
  }

  const weightOf = new Map(entries.map((e) => [e.source, e.weight]));

  return DRIVER_IDS.map((id) => {
    const bucket = byId.get(id) ?? [];
    const weightSum = bucket.reduce(
      (sum, article) => sum + (weightOf.get(article.source) ?? 1),
      0,
    );

    if (bucket.length === 0 || weightSum === 0) {
      return {
        id,
        score: 0,
        articles: 0,
        available: false,
        detail: "no coverage",
      };
    }

    const weighted = bucket.reduce((sum, article) => {
      const w =
        recencyWeight(article.publishedAt, Date.now()) *
        (weightOf.get(article.source) ?? 1) *
        article.relevance;
      return sum + article.sentiment * w;
    }, 0);

    // A single article can only justify a small share of the channel's range.
    const confidence = Math.min(1, bucket.length / 4);
    const score = clamp((weighted / weightSum) * 100 * confidence, -100, 100);

    return {
      id,
      score,
      articles: bucket.length,
      available: true,
      detail: `${bucket.length} article${bucket.length === 1 ? "" : "s"}`,
    };
  });
}

/** Recency and relevance weighted tone across every article in the feed. */
function aggregateTone(articles: NewsArticle[], now: number): number {
  let total = 0;
  for (const article of articles) {
    if (article.relevance === 0) continue;
    total +=
      article.sentiment *
      recencyWeight(article.publishedAt, now) *
      article.relevance;
  }
  // `tanh` keeps one dramatic headline from swamping the aggregate.
  return Math.tanh(total / 6) * 100;
}

/**
 * Global risk appetite, computed from the same weighting as the rial tone but
 * over the separate `riskScore`. Negative is risk-off.
 */
function aggregateRisk(articles: NewsArticle[], now: number): number {
  let total = 0;
  let weight = 0;
  for (const article of articles) {
    if (article.riskScore === 0) continue;
    const w = recencyWeight(article.publishedAt, now);
    total += article.riskScore * w;
    weight += w;
  }
  if (weight === 0) return 0;
  // `tanh` rather than a hard clamp: a war-dominated feed should read strongly
  // risk-off without pinning at −100 and losing all resolution.
  return Math.tanh(total / weight / 25) * 100;
}

function tierCoverage(entries: ScoredEntry[]): Record<NewsTier, number> {
  const out = { iran: 0, usOfficial: 0, usWires: 0, regional: 0 } as Record<
    NewsTier,
    number
  >;

  for (const tier of TIERS) {
    const inTier = entries.filter((entry) => entry.tier === tier);
    const total = inTier.reduce((sum, entry) => sum + entry.weight, 0);
    const live = inTier
      .filter((entry) => entry.status.ok && entry.articles.length > 0)
      .reduce((sum, entry) => sum + entry.weight, 0);
    out[tier] = total === 0 ? 0 : live / total;
  }

  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function emptySnapshot(error: string | null): NewsSnapshot {
  return {
    articles: [],
    fetchedAt: Date.now(),
    sources: NEWS_SOURCES.map((source) => ({
      source: source.id,
      ok: false,
      count: 0,
      error,
      tier: source.tier,
    })),
    unavailable: NEWS_SOURCES.map((source) => source.id),
    stale: false,
    error,
    drivers: MACRO_LEXICON.map((driver) => ({
      id: driver.id,
      score: 0,
      articles: 0,
      available: false,
      detail: "no coverage",
    })),
    coverage: 0,
    aggregate: 0,
    tierCoverage: { iran: 0, usOfficial: 0, usWires: 0, regional: 0 },
    riskAggregate: 0,
  };
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("ECONNABORTED") || error.message === "timeout") {
      return "feed timed out";
    }
    return error.message;
  }
  return "feed request failed";
}
