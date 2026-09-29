import type { IrAssetConfig, IrExchangeConfig, IrTicker } from "./iran.types";

type RawOrderBook = {
  bids?: unknown;
  asks?: unknown;
  lastTradePrice?: unknown;
  lastPrice?: unknown;
  latest?: unknown;
  price?: unknown;
  /**
   * Wallex wraps the book in `result` and uses singular `bid` / `ask` keys
   * with `{ price, quantity }` rows instead of tuples.
   */
  result?: unknown;
  bid?: unknown;
  ask?: unknown;
  /** Tabdeal streams depth Binance style: `b` = bids, `a` = asks. */
  b?: unknown;
  a?: unknown;
};

export type IrTickerIdentity = {
  exchange: IrTicker["exchange"];
  exchangeLabel: string;
  exchangeColor: string;
  exchangeWebsite: string;
  asset: IrTicker["asset"];
  assetLabel: string;
  assetKind: IrTicker["assetKind"];
};

export class IrPriceMapper {
  static toNumber(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  static toRows(value: unknown): [number, number][] {
    if (!Array.isArray(value)) return [];
    const rows: [number, number][] = [];
    for (const row of value) {
      if (Array.isArray(row)) {
        const price = this.toNumber(row[0]);
        const amount = this.toNumber(row[1]);
        if (price !== null && amount !== null) rows.push([price, amount]);
        continue;
      }
      if (typeof row === "object" && row !== null) {
        const record = row as Record<string, unknown>;
        const price = this.toNumber(record.price) ?? this.toNumber(record.rate);
        const amount =
          this.toNumber(record.amount) ??
          this.toNumber(record.quantity) ??
          this.toNumber(record.volume) ??
          this.toNumber(record.vol);
        if (price !== null && amount !== null) rows.push([price, amount]);
      }
    }
    return rows;
  }

  /**
   * Pulls best bid / best ask / last out of any of the order book shapes the
   * five exchanges return. Assumes bids are already sorted best-first, which
   * is true for all of them, but re-sorts defensively anyway.
   */
  static extractDepth(raw: unknown): {
    bestBid: number | null;
    bestAsk: number | null;
    last: number | null;
  } {
    if (typeof raw !== "object" || raw === null) {
      return { bestBid: null, bestAsk: null, last: null };
    }

    const outer = raw as RawOrderBook;
    const nested = outer.result as RawOrderBook | undefined;
    const book =
      nested && typeof nested === "object" ? { ...outer, ...nested } : outer;

    const bids = this.toRows(book.bids ?? book.bid ?? book.b).sort(
      (a, b) => b[0] - a[0],
    );
    const asks = this.toRows(book.asks ?? book.ask ?? book.a).sort(
      (a, b) => a[0] - b[0],
    );

    const bestBid = bids[0]?.[0] ?? null;
    const bestAsk = asks[0]?.[0] ?? null;
    const last =
      this.toNumber(book.lastTradePrice ?? book.lastPrice) ??
      this.toNumber(book.latest) ??
      this.toNumber(book.price);

    return { bestBid, bestAsk, last };
  }

  static identity(
    exchange: IrExchangeConfig,
    asset: IrAssetConfig,
  ): IrTickerIdentity {
    return {
      exchange: exchange.id,
      exchangeLabel: exchange.label,
      exchangeColor: exchange.color,
      exchangeWebsite: exchange.website,
      asset: asset.id,
      assetLabel: asset.label,
      assetKind: asset.kind,
    };
  }

  static buildTicker(
    params: IrTickerIdentity & {
      symbol: string | null;
      raw: unknown;
      quoteScale: number;
      status?: IrTicker["status"];
      error?: string | null;
      updatedAt?: number;
      source?: IrTicker["source"];
      /** Carried over from the previous update so history survives a refresh. */
      spark?: number[];
    },
  ): IrTicker {
    const { exchange, asset, symbol, raw, quoteScale } = params;
    const { bestBid, bestAsk, last } = this.extractDepth(raw);
    const scale = quoteScale > 0 ? quoteScale : 1;

    const bid = bestBid === null ? null : bestBid * scale;
    const ask = bestAsk === null ? null : bestAsk * scale;
    const lastPrice = last === null ? null : last * scale;

    const mid =
      bid !== null && ask !== null
        ? (bid + ask) / 2
        : (ask ?? bid ?? lastPrice);
    const spread = bid !== null && ask !== null ? ask - bid : null;
    const spreadPercent =
      spread !== null && mid !== null && mid !== 0
        ? (spread / mid) * 100
        : null;

    const hasData = bid !== null || ask !== null || lastPrice !== null;

    return {
      key: `${exchange}:${asset}`,
      exchange,
      exchangeLabel: params.exchangeLabel,
      exchangeColor: params.exchangeColor,
      exchangeWebsite: params.exchangeWebsite,
      asset,
      assetLabel: params.assetLabel,
      assetKind: params.assetKind,
      symbol,
      bestBid: bid,
      bestAsk: ask,
      mid,
      last: lastPrice,
      spread,
      spreadPercent,
      spark: params.spark ?? [],
      updatedAt: params.updatedAt ?? null,
      source: params.source ?? "rest",
      status: params.status ?? (hasData ? "live" : "error"),
      error: params.error ?? (hasData ? null : "no market data"),
    };
  }
}
