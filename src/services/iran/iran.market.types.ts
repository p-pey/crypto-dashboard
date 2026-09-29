import type { MarketCategory, MarketSourceId } from "~/constants/iranMarket";
import type { TranslationKey } from "~/i18n/dictionaries/types";

/**
 * One row of the unified Iranian price board.
 *
 * Every source is normalised into this shape so the table can hold exchange
 * order books, Wallex's full market list and nerkh.io's rate feed side by
 * side. All prices are in **Rial**; the UI converts for display. Fields a
 * source cannot supply are `null` rather than absent, so one column set covers
 * every row kind.
 */
export type MarketRow = {
  key: string;
  source: MarketSourceId;
  /** Canonical instrument id, unique within a source. */
  assetId: string;
  category: MarketCategory;
  /** Dictionary key used when the source does not supply its own name. */
  labelKey: TranslationKey;
  /**
   * Name supplied by the source, already in the visitor's language when the
   * source is bilingual (Wallex publishes both `faName` and `enName`).
   */
  upstreamName: string | null;
  /** Exchange symbol or nerkh.io instrument key. */
  symbol: string | null;
  /** Best bid in Rial, or the window low for sources without a book. */
  bid: number | null;
  /** Best ask in Rial, or the window high for sources without a book. */
  ask: number | null;
  /** Midpoint of bid/ask, or the last traded rate. */
  mid: number | null;
  /** Rolling series for the sparkline, in Rial. */
  spark: number[];
  /** Percent move over the window the source publishes. */
  changePercent: number | null;
  /** Window the `changePercent` refers to, in hours. */
  changeWindowHours: number | null;
  /** True when a websocket, not a poll, last produced this row. */
  live: boolean;
  status: "live" | "stale" | "error";
  error: string | null;
  updatedAt: number | null;
};

/** A board row exactly as the exchange list endpoint returns it. */
export type ExchangeBoardRow = {
  source: MarketSourceId;
  assetId: string;
  category: MarketCategory;
  labelKey: TranslationKey;
  upstreamName: { fa: string | null; en: string | null };
  symbol: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  changePercent: number | null;
  /** 24h volume in Rial, when the source reports it. */
  volume: number | null;
};

export type ExchangeBoard = {
  source: MarketSourceId;
  rows: ExchangeBoardRow[];
  fetchedAt: number;
  error: string | null;
};
