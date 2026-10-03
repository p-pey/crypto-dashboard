import type {
  IrAssetConfig,
  IrExchangeConfig,
} from "~/services/iran/iran.types";

/**
 * Assets tracked with a live order book and websocket on every exchange.
 *
 * Tether plus the two tokenised golds. Physical 18k gold is not here: none of
 * the four venues list it (`GOLD18IRT` answers 400 on Nobitex, 422 on Wallex,
 * 404 on Bitpin and Tabdeal), so it is sourced from nerkh.io and appears as a
 * single reference row rather than four dead ones.
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
  {
    id: "paxg",
    label: "PAXG / IRT",
    labelKey: "irPrice.assets.paxg",
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
  // Wallex quotes only TMN and USDT; there is no IRT market to fall back to.
  wallex: [{ symbol: "USDTTMN", quoteScale: 10 }],
  bitpin: [{ symbol: "USDT_IRT", quoteScale: 10 }],
  tabdeal: [{ symbol: "USDT_IRT", quoteScale: 10, streamSymbol: "usdtirt" }],
} as const;

/**
 * PAXG markets.
 *
 * Verified live on all four venues: `PAXGIRT`, `PAXGTMN`, `PAXG_IRT` and
 * `PAXGIRT` respectively. Note Wallex has no `IRT` market at all, so the `_TMN`
 * entry is the only candidate there - the earlier `USDTIRT`/`XAUTIRT` fallbacks
 * for Wallex could never have answered and have been removed.
 */
const PAXG_SYMBOLS = {
  nobitex: [{ symbol: "PAXGIRT", quoteScale: 1 }],
  wallex: [{ symbol: "PAXGTMN", quoteScale: 10 }],
  bitpin: [{ symbol: "PAXG_IRT", quoteScale: 10 }],
  tabdeal: [{ symbol: "PAXG_IRT", quoteScale: 10, streamSymbol: "paxgirt" }],
} as const;

const XAUT_SYMBOLS = {
  nobitex: [{ symbol: "XAUTIRT", quoteScale: 1 }],
  wallex: [{ symbol: "XAUTTMN", quoteScale: 10 }],
  bitpin: [{ symbol: "XAUT_IRT", quoteScale: 10 }],
  tabdeal: [{ symbol: "XAUT_IRT", quoteScale: 10, streamSymbol: "xautirt" }],
} as const;

function symbolsOf(
  id: "nobitex" | "wallex" | "bitpin" | "tabdeal",
): IrExchangeConfig["symbols"] {
  return {
    usdt: [...USDT_SYMBOLS[id]],
    xaut: [...XAUT_SYMBOLS[id]],
    paxg: [...PAXG_SYMBOLS[id]],
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
