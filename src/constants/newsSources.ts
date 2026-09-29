import "server-only";

/**
 * Aggregators the crawler reads.
 *
 * Server-only: the feed URLs are crawler internals and must not end up in the
 * client bundle. Client Components that need the UI labels import them from
 * the dictionary instead.
 */
export type NewsSourceId =
  "mehr" | "irna" | "isna" | "khabaronline" | "tehrantimes";

export type NewsCategory = "macro" | "markets" | "politics" | "other";

export type NewsSourceConfig = {
  id: NewsSourceId;
  /** Dictionary key for the outlet name shown in the UI. */
  labelKey:
    | "news.source.mehr"
    | "news.source.irna"
    | "news.source.isna"
    | "news.source.khabaronline"
    | "news.source.tehrantimes";
  feedUrl: string;
  /** Text encoding of the feed, sniffed from the XML declaration. */
  encoding: "utf-8" | "windows-1256";
  lang: "fa" | "en";
  /** Politically or analytically weightier outlets get a larger vote share. */
  weight: number;
};

export const NEWS_SOURCES: NewsSourceConfig[] = [
  {
    id: "mehr",
    labelKey: "news.source.mehr",
    feedUrl: "https://www.mehrnews.com/rss",
    encoding: "utf-8",
    lang: "fa",
    weight: 1.1,
  },
  {
    id: "irna",
    labelKey: "news.source.irna",
    feedUrl: "https://irna.ir/rss",
    encoding: "utf-8",
    lang: "fa",
    weight: 1.2,
  },
  {
    id: "isna",
    labelKey: "news.source.isna",
    feedUrl: "https://www.isna.ir/rss",
    encoding: "utf-8",
    lang: "fa",
    weight: 1.2,
  },
  {
    id: "khabaronline",
    labelKey: "news.source.khabaronline",
    feedUrl: "https://khabaronline.ir/rss",
    encoding: "utf-8",
    lang: "fa",
    weight: 1,
  },
  {
    id: "tehrantimes",
    labelKey: "news.source.tehrantimes",
    feedUrl: "https://tehrantimes.com/rss/",
    encoding: "utf-8",
    lang: "en",
    weight: 0.9,
  },
];

export const NEWS_SOURCE_IDS: NewsSourceId[] = NEWS_SOURCES.map(
  (source) => source.id,
);
