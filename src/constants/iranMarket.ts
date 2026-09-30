import type { TranslationKey } from "~/i18n/dictionaries/types";
import type { IrExchangeId } from "~/services/iran/iran.types";

/**
 * Client-safe description of every Iranian price source.
 *
 * The crawls themselves (REST endpoints, websocket URLs) live in the
 * server-only `IR_EXCHANGES` / nerkh modules; this file is the catalogue the
 * UI needs in order to label, colour and filter whatever those crawls return.
 */

export type MarketSourceId = IrExchangeId | "nerkh";

/** How a source publishes its prices. */
export type MarketSourceKind = "exchange" | "aggregator";

/**
 * Whether a source pushes prices over a websocket or is crawled on a timer.
 *
 * This decides two things: which rows the refresh button is allowed to touch,
 * and how often the crawler runs. A socket source is already current, so
 * re-requesting it only costs a round trip.
 */
export type MarketSourceTransport = "socket" | "poll";

export type MarketSourceMeta = {
  id: MarketSourceId;
  label: string;
  color: string;
  website: string;
  kind: MarketSourceKind;
  transport: MarketSourceTransport;
  /**
   * Sources that expose a full market list get a `board` row per market;
   * sources that only publish a handful of tracked assets get deep rows with
   * an order book instead.
   */
  wide: boolean;
};

export const MARKET_SOURCES: MarketSourceMeta[] = [
  {
    id: "nobitex",
    label: "Nobitex",
    color: "#2f7de1",
    website: "https://nobitex.ir",
    kind: "exchange",
    transport: "socket",
    wide: false,
  },
  {
    id: "wallex",
    label: "Wallex",
    color: "#7b61ff",
    website: "https://wallex.ir",
    kind: "exchange",
    transport: "socket",
    // Wallex streams its tracked order books over socket.io, but the wide
    // market list behind its board rows is a plain REST crawl.
    wide: true,
  },
  {
    id: "bitpin",
    label: "Bitpin",
    color: "#00b894",
    website: "https://bitpin.ir",
    kind: "exchange",
    transport: "socket",
    wide: false,
  },
  {
    id: "tabdeal",
    label: "Tabdeal",
    color: "#f39c12",
    website: "https://tabdeal.org",
    kind: "exchange",
    transport: "socket",
    wide: false,
  },
  {
    id: "nerkh",
    label: "Nerkh",
    color: "#0ea5e9",
    website: "https://nerkh.io",
    kind: "aggregator",
    transport: "poll",
    // No websocket: nerkh.io is crawled on a timer.
    wide: true,
  },
];

/** Sources with no websocket, crawled on the poll interval. */
export const POLLED_SOURCES: MarketSourceMeta[] = MARKET_SOURCES.filter(
  (source) => source.transport === "poll",
);

/** Sources that stream over a websocket and are never re-requested by hand. */
export const SOCKET_SOURCES: MarketSourceMeta[] = MARKET_SOURCES.filter(
  (source) => source.transport === "socket",
);

const SOURCE_INDEX = new Map<MarketSourceId, MarketSourceMeta>(
  MARKET_SOURCES.map((source) => [source.id, source]),
);

export function marketSource(id: MarketSourceId): MarketSourceMeta {
  return (
    SOURCE_INDEX.get(id) ?? {
      id,
      label: id,
      color: "var(--text-3)",
      website: "https://nerkh.io",
      kind: "aggregator",
      transport: "poll",
      wide: false,
    }
  );
}

/** The five buckets every row is sorted and filtered by. */
export type MarketCategory = "fiat" | "stablecoin" | "gold" | "coin" | "crypto";

export const MARKET_CATEGORIES: readonly MarketCategory[] = [
  "fiat",
  "stablecoin",
  "gold",
  "coin",
  "crypto",
];

export const CATEGORY_LABEL_KEYS: Record<MarketCategory, TranslationKey> = {
  fiat: "irPrice.categories.fiat",
  stablecoin: "irPrice.categories.stablecoin",
  gold: "irPrice.categories.gold",
  coin: "irPrice.categories.coin",
  crypto: "irPrice.categories.crypto",
};

export const CATEGORY_COLOR: Record<MarketCategory, string> = {
  fiat: "var(--cyan)",
  stablecoin: "var(--brand-2)",
  gold: "var(--amber)",
  coin: "var(--mint)",
  crypto: "var(--text-2)",
};

/** Base assets that are metals rather than coins. */
const GOLD_BASES = new Set([
  "GOLD18",
  "GOLD24",
  "GOLD18K",
  "GOLD24K",
  "GOLDTO",
  "GOLD",
  "XAUT",
  "PAXG",
  "OUNCE",
  "MELT21",
]);

/** Iranian coin issues. */
const COIN_BASES = new Set([
  "SEKE_EMAMI",
  "SEKE_BAHAR",
  "SEKE_NIM",
  "SEKE_ROB",
  "SEKE_1G",
  "SEKE",
  "SEKEMAMI",
  "SEKEBAHAR",
  "SEKENIM",
  "SEKEROB",
  "SEKE1G",
  "SEKE_PRS100",
  "SEKE_PRS200",
  "SEKE_PRS400",
  "SEKE_PRS500",
  "SEKE_PRS700",
  "SEKEPR",
]);

/** Fiat currencies nerkh.io quotes directly. */
const FIAT_BASES = new Set([
  "USD",
  "EUR",
  "GBP",
  "AED",
  "TRY",
  "CHF",
  "CAD",
  "CNY",
  "QAR",
  "IRR",
  "IRT",
  "TMN",
]);

const STABLE_BASES = new Set([
  "USDT",
  "USDC",
  "DAI",
  "TUSD",
  "BUSD",
  "FDUSD",
  "USDP",
  "HRT",
]);

/**
 * Maps a base asset ticker onto one of the five categories.
 *
 * Order matters: gold and coin instruments are checked before the stablecoin
 * and fiat lists, because several gold tickers (`GOLD18`, `SEKE*`) would
 * otherwise be swallowed by a looser match.
 */
export function categoriseBaseAsset(base: string): MarketCategory {
  const key = base.trim().toUpperCase();

  if (GOLD_BASES.has(key)) return "gold";
  if (COIN_BASES.has(key)) return "coin";
  if (STABLE_BASES.has(key)) return "stablecoin";
  if (FIAT_BASES.has(key)) return "fiat";

  // Anything ending in a chain suffix (`BTCUSDT`, `ETHIRT`) is a crypto pair.
  if (key.length > 4) return "crypto";

  return "crypto";
}

/** True when the symbol is quoted in Toman rather than Rial. */
export function isTomanQuote(quote: string): boolean {
  return quote.trim().toUpperCase() === "TMN";
}
