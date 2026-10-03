import "server-only";

import { SOURCE_COUNTRY, type SourceCountry } from "./countries";

/**
 * Aggregators the crawler reads.
 *
 * Server-only: the feed URLs are crawler internals and must not end up in the
 * client bundle. Client Components that need the UI labels import them from
 * the dictionary instead.
 *
 * The list is grouped by tier because the weights differ by an order of
 * magnitude. For USD/IRT the Iranian domestic press is the signal; the US
 * official releases drive the global dollar and therefore the rial's offshore
 * pressure; the regional wires carry the war and escalation risk that
 * dominates Iranian macro headlines.
 */

export type NewsSourceId =
  // Iran, domestic
  | "mehr"
  | "irna"
  | "isna"
  | "khabaronline"
  | "tehrantimes"
  // United States, official
  | "fed"
  | "fedMonetary"
  // United States, wires and markets
  | "cnbcEconomy"
  | "cnbcTop"
  | "marketwatch"
  | "wsjMarkets"
  // Regional and geopolitical
  | "aljazeera"
  | "france24"
  | "scmp";

export type NewsTier = "iran" | "usOfficial" | "usWires" | "regional";

export type NewsCategory = "macro" | "markets" | "politics" | "other";

export type NewsSourceConfig = {
  id: NewsSourceId;
  feedUrl: string;
  lang: "fa" | "en";
  tier: NewsTier;
  /**
   * Which country this outlet reports on. Drives the country selector on the
   * analysis page: the feed list is partitioned instead of re-crawled per
   * country, so switching costs nothing upstream. See `~/constants/countries`.
   */
  country: SourceCountry;
  /**
   * Share of the composite vote. Iranian domestic news is weighted highest
   * because it is the only tier that reports the domestic FX, budget and
   * sanctions situation directly.
   */
  weight: number;
};

/** A feed list entry before its country is resolved from `SOURCE_COUNTRY`. */
type RawNewsSourceConfig = Omit<NewsSourceConfig, "country">;

const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const RAW_NEWS_SOURCES: RawNewsSourceConfig[] = [
  // ---- Iran, domestic ----
  {
    id: "mehr",
    feedUrl: "https://www.mehrnews.com/rss",
    lang: "fa",
    tier: "iran",
    weight: 1.6,
  },
  {
    id: "irna",
    feedUrl: "https://irna.ir/rss",
    lang: "fa",
    tier: "iran",
    weight: 1.7,
  },
  {
    id: "isna",
    feedUrl: "https://www.isna.ir/rss",
    lang: "fa",
    tier: "iran",
    weight: 1.7,
  },
  {
    id: "khabaronline",
    feedUrl: "https://khabaronline.ir/rss",
    lang: "fa",
    tier: "iran",
    weight: 1.5,
  },
  {
    id: "tehrantimes",
    feedUrl: "https://tehrantimes.com/rss/",
    lang: "en",
    tier: "iran",
    weight: 1.3,
  },

  // ---- United States, official ----
  {
    id: "fedMonetary",
    feedUrl: "https://www.federalreserve.gov/feeds/press_monetary.xml",
    lang: "en",
    tier: "usOfficial",
    weight: 1.5,
  },
  {
    id: "fed",
    feedUrl: "https://www.federalreserve.gov/feeds/press_all.xml",
    lang: "en",
    tier: "usOfficial",
    weight: 1,
  },

  // ---- United States, wires and markets ----
  {
    id: "cnbcEconomy",
    feedUrl: "https://www.cnbc.com/id/20910258/device/rss/rss.html",
    lang: "en",
    tier: "usWires",
    weight: 1,
  },
  {
    id: "cnbcTop",
    feedUrl: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    lang: "en",
    tier: "usWires",
    weight: 0.8,
  },
  {
    id: "marketwatch",
    feedUrl: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    lang: "en",
    tier: "usWires",
    weight: 0.8,
  },
  {
    id: "wsjMarkets",
    feedUrl: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
    lang: "en",
    tier: "usWires",
    weight: 0.8,
  },

  // ---- Regional and geopolitical ----
  {
    id: "aljazeera",
    feedUrl: "https://www.aljazeera.com/xml/rss/all.xml",
    lang: "en",
    tier: "regional",
    weight: 1,
  },
  {
    id: "france24",
    feedUrl: "https://www.france24.com/en/rss",
    lang: "en",
    tier: "regional",
    weight: 0.9,
  },
  {
    id: "scmp",
    feedUrl: "https://www.scmp.com/rss/91/feed",
    lang: "en",
    tier: "regional",
    weight: 0.8,
  },
];

/**
 * The country of every outlet is derived from one table in `~/constants/
 * countries` rather than repeated here, so the feed list and the country
 * selector can never disagree about who reports on what.
 */
export const NEWS_SOURCES: NewsSourceConfig[] = RAW_NEWS_SOURCES.map(
  (source) => ({
    ...source,
    country: SOURCE_COUNTRY[source.id],
  }),
);

export const NEWS_SOURCE_IDS: NewsSourceId[] = NEWS_SOURCES.map(
  (source) => source.id,
);

/** At least one tier must have answered for the composite to be trusted. */
export const TIER_LABEL_KEYS = {
  iran: "news.tier.iran",
  usOfficial: "news.tier.usOfficial",
  usWires: "news.tier.usWires",
  regional: "news.tier.regional",
} as const;

export { BROWSER_UA };
