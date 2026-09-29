import {
  categoriseBaseAsset,
  marketSource,
  type MarketCategory,
  type MarketSourceId,
} from "~/constants/iranMarket";
import type { TranslationKey } from "~/i18n/dictionaries/types";
import type { IrTicker } from "~/services/iran/iran.types";
import type {
  ExchangeBoard,
  MarketRow,
} from "~/services/iran/iran.market.types";
import {
  RIAL_PER_TOMAN,
  sparkChangePercent,
  windowBiasPercent,
  type NerkhQuote,
  type NerkhSnapshot,
} from "~/services/nerkh/nerkh.types";

/**
 * Everything the price board needs, folded into one flat row list.
 *
 * Three feeds with three different shapes are normalised here rather than in
 * the table:
 *
 * - **exchange tickers** carry a real order book and are fed by a websocket
 * - **exchange boards** carry a book snapshot for every market the exchange
 *   lists, with the instrument's own Persian and English name
 * - **nerkh quotes** carry a single rate plus 1h and 12h extremes
 *
 * All three end up in Rial with the same column set, so the table can show a
 * Wallex altcoin market, a Nobitex USDT book and a nerkh.io ounce price on the
 * same screen.
 */

/** Canonical id for the nerkh.io instrument that mirrors a tracked asset. */
const NERKH_FOR_ASSET: Record<string, string> = {
  usdt: "USDT",
};

/** nerkh.io instrument id -> dictionary key for instruments we can name. */
const NERKH_LABEL_KEYS: Record<string, TranslationKey> = {
  GOLD18K: "nerkh.instruments.GOLD18K",
  GOLD24K: "nerkh.instruments.GOLD24K",
  GOLD18K_STOCK: "nerkh.instruments.GOLD18K_STOCK",
  GOLD_FUTURES: "nerkh.instruments.GOLD_FUTURES",
  OUNCE: "nerkh.instruments.OUNCE",
  OUNCE_PLATINUM: "nerkh.instruments.OUNCE_PLATINUM",
  OUNCE_SILVER: "nerkh.instruments.OUNCE_SILVER",
  MAZANEH: "nerkh.instruments.MAZANEH",
  MESGHAL: "nerkh.instruments.MESGHAL",
  MILLI_GOLD18K: "nerkh.instruments.MILLI_GOLD18K",
  TA_GOLD_18K: "nerkh.instruments.TA_GOLD_18K",
  T_GOLD_18K: "nerkh.instruments.T_GOLD_18K",
  SEKE_EMAMI: "nerkh.instruments.SEKE_EMAMI",
  SEKE_BAHAR: "nerkh.instruments.SEKE_BAHAR",
  SEKE_NIM: "nerkh.instruments.SEKE_NIM",
  SEKE_ROB: "nerkh.instruments.SEKE_ROB",
  SEKE_1G: "nerkh.instruments.SEKE_1G",
  SEKE_PRS100: "nerkh.instruments.SEKE_PRS100",
  SEKE_PRS200: "nerkh.instruments.SEKE_PRS200",
  SEKE_PRS400: "nerkh.instruments.SEKE_PRS400",
  SEKE_PRS500: "nerkh.instruments.SEKE_PRS500",
  SEKE_PRS700: "nerkh.instruments.SEKE_PRS700",
  USD: "nerkh.instruments.USD",
  EUR: "nerkh.instruments.EUR",
  GBP: "nerkh.instruments.GBP",
  AED: "nerkh.instruments.AED",
  TRY: "nerkh.instruments.TRY",
  CHF: "nerkh.instruments.CHF",
  CAD: "nerkh.instruments.CAD",
  CNY: "nerkh.instruments.CNY",
  QAR: "nerkh.instruments.QAR",
  BTC: "nerkh.instruments.BTC",
  ETH: "nerkh.instruments.ETH",
  USDT: "nerkh.instruments.USDT",
  XRP: "nerkh.instruments.XRP",
  BNB: "nerkh.instruments.BNB",
  DOGE: "nerkh.instruments.DOGE",
  LTC: "nerkh.instruments.LTC",
  TRX: "nerkh.instruments.TRX",
  ADA: "nerkh.instruments.ADA",
  DOT: "nerkh.instruments.DOT",
  DASH: "nerkh.instruments.DASH",
};

/** nerkh.io labels its coins and metals in its own naming, so map the groups. */
function nerkhCategory(quote: NerkhQuote): MarketCategory {
  const key = quote.key.toUpperCase();
  if (quote.group === "currency") return "fiat";
  if (quote.group === "gold") {
    return key.startsWith("SEKE") ? "coin" : "gold";
  }
  return categoriseBaseAsset(key);
}

/** The canonical asset a nerkh.io quote represents, when we track it. */
function nerkhAssetId(quote: NerkhQuote): string {
  for (const [assetId, instrument] of Object.entries(NERKH_FOR_ASSET)) {
    if (instrument === quote.key) return assetId;
  }
  return quote.key;
}

/**
 * The exchange feed tracks a fourth state, `connecting`, for a socket that is
 * still dialling. On a board row that is just "not fresh yet".
 */
function statusOf(status: IrTicker["status"]): MarketRow["status"] {
  return status === "live" ? "live" : status === "error" ? "error" : "stale";
}

/** The deep-feed assets, mapped to the dictionary key shown in the table. */
const ASSET_LABEL_KEYS: Record<IrTicker["asset"], TranslationKey> = {
  usdt: "irPrice.assets.usdt",
  xaut: "irPrice.assets.xaut",
};

function tickerToRow(ticker: IrTicker): MarketRow {
  return {
    key: `exchange:${ticker.exchange}:${ticker.asset}`,
    source: ticker.exchange,
    assetId: ticker.asset,
    category: categoriseBaseAsset(ticker.asset.toUpperCase()),
    labelKey: ASSET_LABEL_KEYS[ticker.asset],
    upstreamName: null,
    symbol: ticker.symbol,
    bid: ticker.bestBid,
    ask: ticker.bestAsk,
    mid: ticker.mid,
    spark: ticker.spark,
    changePercent: percentChange(ticker.spark),
    changeWindowHours: null,
    live: ticker.source === "socket",
    status: statusOf(ticker.status),
    error: ticker.error,
    updatedAt: ticker.updatedAt,
  };
}

/**
 * The exchange feed does not publish a 24 hour percentage, so the move column
 * is derived from the rolling mid-price window the socket has been filling.
 * It is `null` until the window has enough samples to be meaningful.
 */
function percentChange(spark: number[]): number | null {
  if (spark.length < 2) return null;
  const first = spark[0];
  const last = spark[spark.length - 1];
  if (first === undefined || last === undefined || first === 0) return null;
  return ((last - first) / first) * 100;
}

function boardToRow(
  board: ExchangeBoard,
  index: number,
  locale: string,
): MarketRow {
  const row = board.rows[index];
  if (!row) throw new Error("board row out of range");

  const mid =
    row.bid !== null && row.ask !== null
      ? (row.bid + row.ask) / 2
      : (row.ask ?? row.bid ?? row.last);

  const upstream = locale.startsWith("fa")
    ? row.upstreamName.fa
    : row.upstreamName.en;

  return {
    key: `board:${board.source}:${row.symbol}`,
    source: row.source,
    assetId: row.assetId,
    category: row.category,
    labelKey: row.labelKey,
    upstreamName: upstream,
    symbol: row.symbol,
    bid: row.bid,
    ask: row.ask,
    mid,
    spark: [],
    changePercent: row.changePercent,
    changeWindowHours: row.changePercent === null ? null : 24,
    live: false,
    status: mid === null ? "error" : "live",
    error: mid === null ? "no market data" : null,
    updatedAt: board.fetchedAt,
  };
}

function nerkhToRow(quote: NerkhQuote, fetchedAt: number): MarketRow {
  // nerkh.io quotes in Toman; the board is in Rial.
  const toRial = (value: number | null) =>
    value === null ? null : value * RIAL_PER_TOMAN;

  const drift = sparkChangePercent(quote);
  const bias = windowBiasPercent(quote, "12hour");

  // With no order book, the 12 hour extremes are the closest thing nerkh.io
  // offers to a bid and an ask, and they line up with the other sources' low
  // and high columns.
  return {
    key: `nerkh:${quote.key}`,
    source: "nerkh",
    assetId: nerkhAssetId(quote),
    category: nerkhCategory(quote),
    labelKey: NERKH_LABEL_KEYS[quote.key] ?? "irPrice.assets.other",
    upstreamName: null,
    symbol: quote.key,
    bid: toRial(quote.min["12hour"]),
    ask: toRial(quote.max["12hour"]),
    mid: toRial(quote.current),
    spark: quote.spark.map((value) => value * RIAL_PER_TOMAN),
    // Prefer the observed drift; fall back to where the price sits inside its
    // own 12 hour range, which needs no history to be meaningful.
    changePercent: drift ?? bias,
    changeWindowHours: drift === null ? (bias === null ? null : 12) : null,
    live: false,
    status: "live",
    error: null,
    updatedAt: quote.updatedLabel ? fetchedAt : null,
  };
}

export type MarketBoardInput = {
  tickers: IrTicker[];
  boards: ExchangeBoard[];
  nerkh: NerkhSnapshot | undefined;
  locale: string;
};

/**
 * Deep rows win over board rows for the same instrument on the same source:
 * the deep feed is websocket-backed and therefore fresher, so the board's
 * snapshot copy of USDT or GOLD18K is dropped rather than shown twice.
 */
export function buildMarketBoard(input: MarketBoardInput): MarketRow[] {
  const { tickers, boards, nerkh, locale } = input;

  const deep = tickers.map(tickerToRow);
  const claimed = new Set(deep.map((row) => `${row.source}:${row.assetId}`));

  const rows: MarketRow[] = [...deep];

  for (const board of boards) {
    board.rows.forEach((_, index) => {
      const row = boardToRow(board, index, locale);
      if (claimed.has(`${row.source}:${row.assetId}`)) return;
      rows.push(row);
    });
  }

  if (nerkh) {
    for (const quote of nerkh.quotes) {
      const asset = nerkhAssetId(quote);
      // A nerkh rate for an asset an exchange already quotes with a live book
      // would be the same instrument priced twice; the book wins.
      if (claimed.has(`nerkh:${asset}`)) continue;
      rows.push(nerkhToRow(quote, nerkh.fetchedAt));
    }
  }

  return sortBoard(rows);
}

/** Sources in display order, so the deep books sit above the wide board. */
const SOURCE_ORDER: MarketSourceId[] = [
  "nobitex",
  "wallex",
  "bitpin",
  "tabdeal",
  "nerkh",
];

/**
 * Category-major order, so the board reads as a catalogue: every fiat row
 * together, then stablecoins, then gold, coins and crypto. Within a category
 * the same instrument from every source ends up adjacent, which is what makes
 * the "who is cheapest" comparison possible at a glance.
 *
 * A plain sort is used rather than antd's `rowSpan` grouping because the user
 * can sort any column, and a rowSpan would break the moment the order is no
 * longer category-contiguous.
 */
function sortBoard(rows: MarketRow[]): MarketRow[] {
  const sourceRank = (id: MarketSourceId) => {
    const index = SOURCE_ORDER.indexOf(id);
    return index === -1 ? SOURCE_ORDER.length : index;
  };

  return [...rows].sort(
    (a, b) =>
      categoryRank(a.category) - categoryRank(b.category) ||
      a.assetId.localeCompare(b.assetId, "en") ||
      sourceRank(a.source) - sourceRank(b.source),
  );
}

/** Category rank used to keep the board in a stable, readable order. */
export function categoryRank(category: MarketCategory): number {
  const order: MarketCategory[] = [
    "fiat",
    "stablecoin",
    "gold",
    "coin",
    "crypto",
  ];
  const index = order.indexOf(category);
  return index === -1 ? order.length : index;
}

/** Sources that actually produced at least one row, for the source filter. */
export function activeSources(rows: MarketRow[]): MarketSourceId[] {
  return [...new Set(rows.map((row) => row.source))];
}

export { marketSource };
