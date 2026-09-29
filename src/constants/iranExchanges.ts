import type {
  IrAssetConfig,
  IrExchangeConfig,
} from "~/services/iran/iran.types";

/**
 * Assets tracked with a live order book and websocket on every exchange.
 *
 * Only XAUT is treated as gold here: none of the four exchanges currently list
 * a physical 18k gold market (`GOLD18IRT` answers 400 on Nobitex, 422 on
 * Wallex and 404 on Bitpin and Tabdeal), so 18k gold is sourced from
 * nerkh.io instead and shows up as a single board row rather than four dead
 * ones. Everything else these exchanges list arrives through the wide Wallex
 * market list.
 */
export const IR_ASSETS: IrAssetConfig[] = [
  {
    id: "usdt",
    label: "USDT / IRT",
    labelKey: "irPrice.assets.usdt",
    kind: "fiat",
  },
  {
    id: "xaut",
    label: "XAUT / IRT",
    labelKey: "irPrice.assets.xaut",
    kind: "gold",
  },
];

/**
 * Quote units differ per exchange even when the symbol says `IRT`:
 * Nobitex quotes in Rial, while Bitpin and Tabdeal quote their `_IRT` markets
 * in Toman (Bitpin's own `/mkt/currencies/` list names the asset "Toman").
 * `quoteScale` normalizes everything to Rial, which is why the non-Nobitex
 * entries carry a factor of 10 (1 Toman = 10 Rial).
 */
const USDT_SYMBOLS = {
  nobitex: [{ symbol: "USDTIRT", quoteScale: 1 }],
  wallex: [
    { symbol: "USDTTMN", quoteScale: 10 },
    { symbol: "USDTIRT", quoteScale: 1 },
  ],
  bitpin: [{ symbol: "USDT_IRT", quoteScale: 10 }],
  tabdeal: [{ symbol: "USDT_IRT", quoteScale: 10, streamSymbol: "usdtirt" }],
} as const;

const XAUT_SYMBOLS = {
  nobitex: [{ symbol: "XAUTIRT", quoteScale: 1 }],
  wallex: [
    { symbol: "XAUTTMN", quoteScale: 10 },
    { symbol: "XAUTIRT", quoteScale: 1 },
  ],
  bitpin: [{ symbol: "XAUT_IRT", quoteScale: 10 }],
  tabdeal: [{ symbol: "XAUT_IRT", quoteScale: 10, streamSymbol: "xautirt" }],
} as const;

function symbolsOf(
  id: "nobitex" | "wallex" | "bitpin" | "tabdeal",
): IrExchangeConfig["symbols"] {
  return {
    usdt: [...USDT_SYMBOLS[id]],
    xaut: [...XAUT_SYMBOLS[id]],
  };
}

export const IR_EXCHANGES: IrExchangeConfig[] = [
  {
    id: "nobitex",
    label: "Nobitex",
    color: "#2f7de1",
    website: "https://nobitex.ir",
    orderbookUrl: "https://apiv2.nobitex.ir/v3/orderbook/{symbol}",
    statsUrl:
      "https://apiv2.nobitex.ir/market/stats?srcCurrency={base}&dstCurrency={quote}",
    socket: {
      url: "wss://ws.nobitex.ir/connection/websocket",
      protocol: "centrifugo",
      stream: (symbol) => `public:orderbook-${symbol}`,
    },
    symbols: symbolsOf("nobitex"),
  },
  {
    id: "wallex",
    label: "Wallex",
    color: "#7b61ff",
    website: "https://wallex.ir",
    orderbookUrl: "https://api.wallex.ir/v1/depth?symbol={symbol}",
    socket: {
      url: "https://api.wallex.ir",
      protocol: "socketio",
      stream: (symbol) => `${symbol}@marketCap`,
    },
    symbols: symbolsOf("wallex"),
  },
  {
    id: "bitpin",
    label: "Bitpin",
    color: "#00b894",
    website: "https://bitpin.ir",
    orderbookUrl: "https://api.bitpin.ir/api/v1/mth/orderbook/{symbol}/",
    socket: {
      url: "wss://centrifugo.bitpin.ir/connection/websocket",
      protocol: "centrifugo",
      stream: (symbol) => `public:orderbook:${symbol}`,
    },
    symbols: symbolsOf("bitpin"),
  },
  {
    id: "tabdeal",
    label: "Tabdeal",
    color: "#f39c12",
    website: "https://tabdeal.org",
    orderbookUrl:
      "https://api1.tabdeal.org/r/api/v1/depth?tabdealSymbol={symbol}",
    socket: {
      url: "wss://api1.tabdeal.org/stream/",
      protocol: "jsonrpc",
      stream: (symbol) => `${symbol}@depth@2000ms`,
    },
    symbols: symbolsOf("tabdeal"),
  },
];
