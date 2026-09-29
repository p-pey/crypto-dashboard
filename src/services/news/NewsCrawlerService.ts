import { NEWS_SOURCES, type NewsSourceId } from "~/constants/newsSources";
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

const PER_SOURCE = 40;

/**
 * nerkh.io (and at least one other Iranian host) rejects anything that does not
 * look like a browser with a plain 403, so the crawler sends a desktop UA
 * rather than axios' default `axios/1.x`.
 */
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const FEED_HEADERS: Record<string, string> = {
  Accept:
    "application/rss+xml, application/xml, text/xml, application/atom+xml;q=0.9, */*;q=0.8",
  "Accept-Language": "fa,en;q=0.8",
  "User-Agent": BROWSER_UA,
};

type Cached = { snapshot: NewsSnapshot; expiresAt: number };

/**
 * Aggregates Iranian news agency feeds and turns them into a macro reading.
 *
 * Every outlet is fetched independently and concurrently, so one dead feed
 * costs only its own share of the coverage figure. The composite score is
 * recency and relevance weighted, and normalised against the driver weights so
 * the eight channels stay comparable. There is no model and no API key: every
 * number in the output traces back to a headline in the feed.
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
          const articles = mapFeed(source.id, xml, {
            perSource,
            now,
            maxAgeMs,
          });
          return {
            source: source.id,
            status: {
              source: source.id,
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
            status: {
              source: source.id,
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
    ).slice(0, 180);

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
    };

    this.cache = { snapshot, expiresAt: now + NEWS_TTL_MS };
    return snapshot;
  }

  private async fetchFeed(url: string): Promise<string> {
    const { data } = await this.http.get<string>(url, {
      headers: FEED_HEADERS,
      timeout: 10_000,
      responseType: "text",
      // A couple of the outlets answer 200 with a redirect interstitial.
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
