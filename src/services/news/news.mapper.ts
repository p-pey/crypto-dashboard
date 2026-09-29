import { parseRssItems } from "~/services/statuses/sentiment.lexer";

import type { NewsSourceId } from "~/constants/newsSources";
import { classifyHeadline, matchDrivers, normaliseText } from "./macro.lexicon";
import type { MacroDriverId, NewsArticle } from "./news.types";

/** Stable id so React keys and de-duplication survive a refetch. */
function articleId(source: NewsSourceId, link: string, title: string): string {
  const basis = `${source}|${link || title}`;
  let hash = 2166136261;
  for (let i = 0; i < basis.length; i += 1) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${source}-${(hash >>> 0).toString(36)}`;
}

/**
 * Persian outlets commonly append `| نام خبرگزاری` to the headline. Keeping
 * the outlet out of the scored text stops the same few words from being counted
 * once per source.
 */
function stripOutletSuffix(title: string, source: NewsSourceId): string {
  const suffixes: Record<NewsSourceId, string[]> = {
    mehr: ["مهر", "خبرگزاری مهر"],
    irna: ["ایرنا", "خبرگزاری ایرنا"],
    isna: ["ایسنا"],
    khabaronline: ["خبرآنلاین"],
    tehrantimes: ["Tehran Times", "TEHRAN TIMES"],
  };

  let out = title;
  for (const suffix of suffixes[source]) {
    const pattern = new RegExp(
      `\\s*[|\\-–—/]\\s*${suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
      "i",
    );
    out = out.replace(pattern, "");
  }
  return out.trim() || title;
}

/**
 * Turns a raw feed into scored articles.
 *
 * `relevance` gates the article into the macro composite: a headline that hits
 * no driver at all is still shown in the feed but contributes nothing to the
 * forecast, which keeps general news from diluting the signal.
 */
export function mapFeed(
  source: NewsSourceId,
  xml: string,
  options: { perSource: number; now: number; maxAgeMs: number },
): NewsArticle[] {
  const items = parseRssItems(xml, options.perSource * 4);
  const articles: NewsArticle[] = [];

  for (const item of items) {
    if (articles.length >= options.perSource) break;

    const title = stripOutletSuffix(item.title, source);
    const age = options.now - item.publishedAt;
    // Feeds occasionally carry a future or zero timestamp; keep those rather
    // than dropping every item from an outlet that never sets `pubDate`.
    if (age > options.maxAgeMs) continue;

    const matches = matchDrivers(title);
    const relevance =
      matches.length === 0
        ? 0
        : Math.min(
            1,
            matches.reduce((sum, m) => sum + Math.abs(m.score), 0) / 1.6,
          );

    articles.push({
      id: articleId(source, item.link, title),
      title,
      link: item.link,
      source,
      publishedAt: item.publishedAt,
      category: classifyHeadline(title),
      relevance,
      // Volume-weighted so a headline hitting two drivers does not simply
      // score twice as hard as one hitting a single driver.
      sentiment:
        matches.length === 0
          ? 0
          : matches.reduce((sum, m) => sum + m.score, 0) / matches.length,
      matches: matches.map((m) => m.driver),
    });
  }

  return articles;
}

/** Deduplicates across outlets by normalised title, keeping the first seen. */
export function dedupeArticles(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  const out: NewsArticle[] = [];

  for (const article of articles) {
    const key = normaliseText(article.title).slice(0, 90);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(article);
  }

  return out;
}

export const DRIVER_IDS: MacroDriverId[] = [
  "fx_market",
  "inflation",
  "monetary",
  "sanctions",
  "oil_energy",
  "budget",
  "gold_demand",
  "political_risk",
];
