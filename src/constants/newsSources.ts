import "server-only";

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
  /** Dictionary key for the outlet name shown in the UI. */
  labelKey:
    | "news.source.mehr"
    | "news.source.irna"
    | "news.source.isna"
    | "news.source.khabaronline"
    | "news.source.tehrantimes"
    | "news.source.fed"
    | "news.source.cnbc"
    | "news.source.marketwatch"
    | "news.source.wsj"
    | "news.source.aljazeera"
    | "news.source.france24"
    | "news.source.scmp";
  feedUrl: string;
  lang: "fa" | "en";
  tier: NewsTier;
  /**
   * Share of the composite vote. Iranian domestic news is weighted highest
   * because it is the only tier that reports the domestic FX, budget and
   * sanctions situation directly.
   */
  weight: number;
};

const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const NEWS_SOURCES: NewsSourceConfig[] = [
  // ---- Iran, domestic ----
  {
    id: "mehr",
    labelKey: "news.source.mehr",
    feedUrl: "https://www.mehrnews.com/rss",
    lang: "fa",
    tier: "iran",
    weight: 1.6,
  },
  {
    id: "irna",
    labelKey: "news.source.irna",
    feedUrl: "https://irna.ir/rss",
    lang: "fa",
    tier: "iran",
    weight: 1.7,
  },
  {
    id: "isna",
    labelKey: "news.source.isna",
    feedUrl: "https://www.isna.ir/rss",
    lang: "fa",
    tier: "iran",
    weight: 1.7,
  },
  {
    id: "khabaronline",
    labelKey: "news.source.khabaronline",
    feedUrl: "https://khabaronline.ir/rss",
    lang: "fa",
    tier: "iran",
    weight: 1.5,
  },
  {
    id: "tehrantimes",
    labelKey: "news.source.tehrantimes",
    feedUrl: "https://tehrantimes.com/rss/",
    lang: "en",
    tier: "iran",
    weight: 1.3,
  },

  // ---- United States, official ----
  {
    id: "fedMonetary",
    labelKey: "news.source.fed",
    feedUrl: "https://www.federalreserve.gov/feeds/press_monetary.xml",
    lang: "en",
    tier: "usOfficial",
    weight: 1.5,
  },
  {
    id: "fed",
    labelKey: "news.source.fed",
    feedUrl: "https://www.federalreserve.gov/feeds/press_all.xml",
    lang: "en",
    tier: "usOfficial",
    weight: 1,
  },

  // ---- United States, wires and markets ----
  {
    id: "cnbcEconomy",
    labelKey: "news.source.cnbc",
    feedUrl: "https://www.cnbc.com/id/20910258/device/rss/rss.html",
    lang: "en",
    tier: "usWires",
    weight: 1,
  },
  {
    id: "cnbcTop",
    labelKey: "news.source.cnbc",
    feedUrl: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    lang: "en",
    tier: "usWires",
    weight: 0.8,
  },
  {
    id: "marketwatch",
    labelKey: "news.source.marketwatch",
    feedUrl: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    lang: "en",
    tier: "usWires",
    weight: 0.8,
  },
  {
    id: "wsjMarkets",
    labelKey: "news.source.wsj",
    feedUrl: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
    lang: "en",
    tier: "usWires",
    weight: 0.8,
  },

  // ---- Regional and geopolitical ----
  {
    id: "aljazeera",
    labelKey: "news.source.aljazeera",
    feedUrl: "https://www.aljazeera.com/xml/rss/all.xml",
    lang: "en",
    tier: "regional",
    weight: 1,
  },
  {
    id: "france24",
    labelKey: "news.source.france24",
    feedUrl: "https://www.france24.com/en/rss",
    lang: "en",
    tier: "regional",
    weight: 0.9,
  },
  {
    id: "scmp",
    labelKey: "news.source.scmp",
    feedUrl: "https://www.scmp.com/rss/91/feed",
    lang: "en",
    tier: "regional",
    weight: 0.8,
  },
];

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
