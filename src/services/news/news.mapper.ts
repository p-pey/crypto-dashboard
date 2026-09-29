import { parseRssItems } from "~/services/statuses/sentiment.lexer";

import { classifyHeadline, matchDrivers, normaliseText } from "./macro.lexicon";
import { directionOf, matchAspects, summariseMatches } from "./aspect.lexicon";
import type { NewsSourceId, NewsSourceConfig } from "~/constants/newsSources";
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
function stripOutletSuffix(title: string, suffixes: string[]): string {
  let out = title;
  for (const suffix of suffixes) {
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
  config: NewsSourceConfig,
  xml: string,
  options: { perSource: number; now: number; maxAgeMs: number },
): NewsArticle[] {
  const items = parseRssItems(xml, options.perSource * 4);
  const articles: NewsArticle[] = [];

  for (const item of items) {
    if (articles.length >= options.perSource) break;

    const title = stripOutletSuffix(item.title, suffixesFor(config));
    const age = options.now - item.publishedAt;
    // Feeds occasionally carry a future or zero timestamp; keep those rather
    // than dropping every item from an outlet that never sets `pubDate`.
    if (age > options.maxAgeMs) continue;

    const matches = matchDrivers(title);
    const aspects = matchAspects(title);
    const summary = summariseMatches(aspects);

    const relevance =
      matches.length === 0
        ? Math.min(1, aspects.length / 2) * 0.5
        : Math.min(
            1,
            matches.reduce((sum, m) => sum + Math.abs(m.score), 0) / 1.6,
          );

    articles.push({
      id: articleId(config.id, item.link, title),
      title,
      link: item.link,
      source: config.id,
      tier: config.tier,
      publishedAt: item.publishedAt,
      category: classifyHeadline(title),
      relevance,
      // The macro driver lexicon stays the authority on rial pressure; the
      // aspect lexicon only fills in when it found nothing.
      sentiment:
        matches.length > 0
          ? matches.reduce((sum, m) => sum + m.score, 0) / matches.length
          : summary.rial,
      matches: matches.map((m) => m.driver),
      aspect: summary.aspect,
      result: summary.aspect === null ? null : directionOf(summary.rial),
      stance: summary.stance,
      riskScore: Math.round(summary.risk * 100),
    });
  }

  return articles;
}

function suffixesFor(config: NewsSourceConfig): string[] {
  const map: Partial<Record<NewsSourceId, string[]>> = {
    mehr: ["مهر", "خبرگزاری مهر"],
    irna: ["ایرنا", "خبرگزاری ایرنا"],
    isna: ["ایسنا"],
    khabaronline: ["خبرآنلاین"],
    tehrantimes: ["Tehran Times", "TEHRAN TIMES"],
    fed: ["Federal Reserve", "Board of Governors"],
    cnbcEconomy: ["CNBC"],
    cnbcTop: ["CNBC"],
    marketwatch: ["MarketWatch"],
    wsjMarkets: ["WSJ.com", "The Wall Street Journal"],
    aljazeera: ["Al Jazeera"],
    france24: ["France 24"],
    scmp: ["South China Morning Post", "SCMP"],
  };
  return map[config.id] ?? [];
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
