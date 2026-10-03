export type IrExchangeId = "nobitex" | "wallex" | "bitpin" | "tabdeal";

/**
 * The tracked instruments.
 *
 * PAXG was added alongside XAUT because the operator tracks tokenised gold, and
 * the two are listed separately by all four venues with different tick sizes -
 * treating them as one asset would produce an order one venue accepts and the
 * other rejects.
 *
 * Physical 18k gram gold is deliberately **not** here. No Iranian venue lists
 * it, so it is sourced from nerkh.io as a reference row with no order buttons
 * and gets its id from the nerkh side of the board.
 */
export type IrAssetId = "usdt" | "xaut" | "paxg";

export type IrSocketProtocol = "centrifugo" | "socketio" | "jsonrpc";

export type IrTickerSource = "rest" | "socket";

export type IrTickerStatus = "live" | "connecting" | "stale" | "error";

export type IrAssetKind = "fiat" | "gold";

/**
 * A symbol candidate for a given asset on a given exchange.
 *
 * `quoteScale` converts the exchange native quote unit into Rial. Wallex for
 * example lists the same market under both `_IRT` and `_TMN`, and a Toman
 * quoted market needs to be multiplied by 10.
 */
export type IrSymbolSpec = {
  symbol: string;
  quoteScale: number;
  /**
   * Websocket symbol when it differs from the REST symbol. Tabdeal is the only
   * one: REST takes `USDT_IRT` while the stream is Binance style `usdtirt`.
   */
  streamSymbol?: string;
};

export type IrAssetConfig = {
  id: IrAssetId;
  /** Short technical label, kept for logs and the URL. */
  label: string;
  /** Dictionary key for the human readable name shown in the UI. */
  labelKey: "irPrice.assets.usdt" | "irPrice.assets.xaut" | "irPrice.assets.paxg";
  kind: IrAssetKind;
};

export type IrExchangeConfig = {
  id: IrExchangeId;
  label: string;
  color: string;
  website: string;
  /**
   * `GET` order book template. `{symbol}` is replaced with the resolved symbol.
   */
  orderbookUrl: string;
  /**
   * `GET` 24h stats template. Optional, only used when the exchange exposes it.
   */
  statsUrl?: string;
  socket: {
    url: string;
    protocol: IrSocketProtocol;
    /**
     * Builds the stream/channel name for a resolved symbol.
     * Nobitex and Bitpin differ only by channel prefix, Wallex by event suffix.
     */
    stream: (symbol: string) => string;
  };
  symbols: Record<IrAssetId, IrSymbolSpec[]>;
};

/** exchange -> asset -> the candidate that actually answered. */
export type IrResolvedSymbols = Partial<
  Record<IrExchangeId, Partial<Record<IrAssetId, IrSymbolSpec>>>
>;

export type IrTicker = {
  key: string;
  exchange: IrExchangeId;
  exchangeLabel: string;
  exchangeColor: string;
  exchangeWebsite: string;
  asset: IrAssetId;
  assetLabel: string;
  assetKind: IrAssetKind;
  symbol: string | null;
  /** Best bid, normalized to IRT. */
  bestBid: number | null;
  /** Best ask, normalized to IRT. */
  bestAsk: number | null;
  /** Midpoint of best bid and best ask, normalized to IRT. */
  mid: number | null;
  /** Last traded price when the exchange reports one, normalized to IRT. */
  last: number | null;
  spread: number | null;
  spreadPercent: number | null;
  /**
   * Rolling mid-price window for the trend sparkline. Seeded with the first
   * observed price and extended by every socket update for this pair.
   */
  spark: number[];
  updatedAt: number | null;
  /** Which transport last produced this price. */
  source: IrTickerSource;
  status: IrTickerStatus;
  error: string | null;
};

export type IrTickerListener = (tickers: IrTicker[]) => void;
