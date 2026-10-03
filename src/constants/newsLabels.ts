import type { NewsSourceId } from "./newsSources";
import type { TranslationKey } from "~/i18n/dictionaries/types";

/**
 * Outlet names for the UI.
 *
 * Client-safe, unlike `~/constants/newsSources`, which is `server-only` because
 * it holds the feed URLs. The mapping is explicit rather than derived from the
 * source id because several ids share a name — both Federal Reserve feeds are
 * shown as "US Federal Reserve" — and a lookup built by string concatenation
 * would render a raw dictionary key for every one of them.
 */
export const NEWS_SOURCE_LABEL_KEYS: Record<NewsSourceId, TranslationKey> = {
  mehr: "news.source.mehr",
  irna: "news.source.irna",
  isna: "news.source.isna",
  khabaronline: "news.source.khabaronline",
  tehrantimes: "news.source.tehrantimes",
  fed: "news.source.fed",
  fedMonetary: "news.source.fed",
  cnbcEconomy: "news.source.cnbc",
  cnbcTop: "news.source.cnbc",
  marketwatch: "news.source.marketwatch",
  wsjMarkets: "news.source.wsj",
  aljazeera: "news.source.aljazeera",
  france24: "news.source.france24",
  scmp: "news.source.scmp",
};
