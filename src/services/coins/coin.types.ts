/**
 * The coin table's row model.
 *
 * ## Why this type exists at all
 *
 * The previous row carried six fields and threw everything else away. CoinGecko's
 * `coins/markets` already returns market cap, circulating supply, FDV, the 24h
 * range, ATH and ATL, and Binance's `24hrTicker` stream already carries the bid,
 * ask, spread, trade count and traded volume. All of it was fetched on every
 * refresh and then discarded by the mapper, which is why the table could not show
 * anything interesting.
 *
 * So the fundamentals live here, alongside the live tick, in one row. The
 * distinction that matters downstream:
 *
 * - **Fundamentals** change once every few minutes and come from the REST query.
 * - **The tick** changes every second and comes from the websocket.
 *
 * They are kept apart so that a tick can replace one row without reallocating the
 * sixteen static fields, which is what lets a price change re-render one row
 * instead of a hundred.
 */

/** Fundamental figures, all from CoinGecko and stable between refreshes. */
export type CoinFundamentals = {
  /** CoinGecko id, needed to resolve the per-coin status analysis. */
  id: string;
  name: string;
  image: string;
  /** Market capitalisation in USD. `null` when the coin reports none. */
  marketCap: number | null;
  marketCapRank: number | null;
  /** Fully diluted valuation, which is what a pre-IPO valuation would look like. */
  fdv: number | null;
  /** Traded value in the last 24h, USD. */
  volume24h: number | null;
  marketCapChange24h: number | null;
  /** 24h price change at the time of the REST fetch. */
  changePercent24h: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  ath: number | null;
  athChangePercent: number | null;
  atl: number | null;
  high24h: number | null;
  low24h: number | null;
  /** CoinGecko's 7 day series, used to seed the sparkline. */
  spark7d: number[];
};

/** The live half, refreshed by every Binance tick. */
export type CoinTick = {
  price: string;
  /** 24h percentage change, already formatted with a sign. */
  changePercent: string;
  /** 24h absolute price change. */
  changeAbs: string;
  /** Best bid and ask, for the liquidity readout. */
  bestBid: string | null;
  bestAsk: string | null;
  /** Spread between them as a percentage, when both sides are known. */
  spreadPercent: string | null;
  /** Trade count in the window, which is a better liquidity proxy than volume
   *  for a coin where a few large prints dominate the notional. */
  trades: number | null;
  /**
   * The exchange's own 24h high and low, as decimal text.
   *
   * Named apart from the CoinGecko `high24h`/`low24h` on purpose: both are real
   * and they differ slightly, because CoinGecko's window is refreshed on a
   * timer while the ticker's updates on every message. Same field name for both
   * sources would intersect to `never` and quietly drop the live one. The UI
   * prefers these and falls back to the REST pair.
   */
  venueHigh24h: string | null;
  venueLow24h: string | null;
};

export type CoinRow = CoinFundamentals &
  CoinTick & {
    /** Stable identity: the Binance symbol, e.g. `BTCUSDT`. */
    symbol: string;
    /** Ticker without the quote, e.g. `BTC`. */
    base: string;
    quote: string;
    /** Row position in the current market-cap ordering. */
    rank: number;
    /** Rolling series backing the sparkline. Held by reference, not copied. */
    spark: number[];
    /**
     * Bumped by the store on every change to this row.
     *
     * Rows are replaced rather than mutated so that `React.memo` can tell which
     * ones actually changed. Without it a tick would re-render the whole table.
     */
    rev: number;
  };

export type CoinSortKey =
  | "rank"
  | "price"
  | "marketCap"
  | "volume24h"
  | "changePercent";

export type SortDirection = "asc" | "desc";

export type CoinSort = {
  key: CoinSortKey;
  direction: SortDirection;
};

/**
 * The table opens on market capitalisation, largest first.
 *
 * It used to inherit CoinGecko's API ordering, which happens to be market cap
 * today but is only an ordering of the response and not a property the table
 * could sort by, change, or reason about. Holding the sort explicitly means the
 * default is a decision rather than an accident.
 */
export const DEFAULT_SORT: CoinSort = { key: "marketCap", direction: "desc" };

/** Nulls always sink, in both directions. */
export const IS_TRADABLE_ASSET = /^[A-Z0-9]{2,15}$/;
