import "server-only";

import { categoriseBaseAsset, isTomanQuote } from "~/constants/iranMarket";
import { AxiosService } from "~/lib/axios";
import { AppInject, AppSignleton } from "~/lib/container";
import type { MarketSourceId } from "~/constants/iranMarket";
import type { TranslationKey } from "~/i18n/dictionaries/types";
import { IrPriceMapper } from "./iran.mapper";
import type { ExchangeBoard, ExchangeBoardRow } from "./iran.market.types";

/**
 * Wallex is the only Iranian exchange that publishes its whole market list with
 * the book snapshot already attached, which means the entire Toman board costs
 * a single request instead of one request per market.
 */
const WALLEX_MARKETS_URL = "https://api.wallex.ir/v1/markets";

/** The list endpoint is heavier than a depth call, so it is polled slowly. */
export const BOARD_TTL_MS = 30_000;

const BROWSER_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "fa,en;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Referer: "https://wallex.ir/",
};

/**
 * Floor below which a market is treated as untraded and dropped. It scales with
 * the quote unit: a Toman market has to be worth at least one Toman, while a
 * USDT market can legitimately be quoted at a fraction of a cent.
 */
const MIN_LAST_PRICE = { toman: 1, usdt: 1e-8 } as const;

/** How the instruments map onto the canonical assets the deep feed tracks. */
const ASSET_ID_OVERRIDES: Record<string, string> = {
  USDTTMN: "usdt",
  USDTIRT: "usdt",
  XAUTTMN: "xaut",
  XAUTIRT: "xaut",
  GOLD18TMN: "digitalGold",
  GOLD18IRT: "digitalGold",
};

type WallexMarket = {
  symbol?: string;
  baseAsset?: string;
  quoteAsset?: string;
  faName?: string;
  enName?: string;
  stats?: {
    bidPrice?: string | number;
    askPrice?: string | number;
    lastPrice?: string | number;
    "24h_ch"?: string | number;
    "24h_volume"?: string | number;
  } | null;
};

function labelKeyFor(assetId: string): TranslationKey {
  switch (assetId) {
    case "usdt":
      return "irPrice.assets.usdt";
    case "xaut":
      return "irPrice.assets.xaut";
    case "digitalGold":
      return "irPrice.assets.digitalGold";
    default:
      return "irPrice.assets.other";
  }
}

/**
 * Wallex quotes everything against Toman. The board is normalised to Rial so
 * it lines up with the order book rows from the other exchanges, which is what
 * `quoteScale` already does for the deep feed.
 */
const TOMAN_TO_RIAL = 10;

@AppSignleton()
export default class WallexBoardService {
  private cache: { board: ExchangeBoard; expiresAt: number } | null = null;
  private inflight: Promise<ExchangeBoard> | null = null;

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {}

  async getBoard(options: { force?: boolean } = {}): Promise<ExchangeBoard> {
    if (!options.force && this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.board;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.crawl().finally(() => {
      this.inflight = null;
    });

    return this.inflight;
  }

  private async crawl(): Promise<ExchangeBoard> {
    try {
      const { data } = await this.http.get<unknown>(WALLEX_MARKETS_URL, {
        headers: BROWSER_HEADERS,
        timeout: 15_000,
      });

      const rows = mapWallexMarkets(data);
      const board: ExchangeBoard = {
        source: "wallex",
        rows,
        fetchedAt: Date.now(),
        error: null,
      };

      this.cache = { board, expiresAt: Date.now() + BOARD_TTL_MS };
      return board;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "wallex market list failed";

      if (this.cache) {
        return { ...this.cache.board, error: message };
      }
      return {
        source: "wallex" as MarketSourceId,
        rows: [],
        fetchedAt: Date.now(),
        error: message,
      };
    }
  }
}

/**
 * Parses the market list. Every field is treated as optional because the
 * endpoint is undocumented: a market with no usable price is skipped rather
 * than rendered as a row of dashes.
 *
 * `isMarketTypeEnable` is deliberately ignored. Despite the name it is an
 * order-type flag, and it is `false` for 183 of the 187 Toman markets, all of
 * which carry live prices. Availability is decided by the price alone.
 */
export function mapWallexMarkets(payload: unknown): ExchangeBoardRow[] {
  const outer = payload as {
    result?: { symbols?: Record<string, WallexMarket> };
  } | null;

  const symbols = outer?.result?.symbols;
  if (!symbols || typeof symbols !== "object") return [];

  const rows: ExchangeBoardRow[] = [];

  for (const [symbol, market] of Object.entries(symbols)) {
    if (market === null || typeof market !== "object") continue;

    const base = market.baseAsset ?? symbol;
    const quote = (market.quoteAsset ?? "").trim().toUpperCase();
    const quotedInToman = isTomanQuote(quote);
    const scale = quotedInToman ? TOMAN_TO_RIAL : 1;
    const floor = quotedInToman ? MIN_LAST_PRICE.toman : MIN_LAST_PRICE.usdt;

    const bid = IrPriceMapper.toNumber(market.stats?.bidPrice);
    const ask = IrPriceMapper.toNumber(market.stats?.askPrice);
    const last = IrPriceMapper.toNumber(market.stats?.lastPrice);

    if (last !== null && last < floor) continue;
    if (bid === null && ask === null && last === null) continue;

    const assetId = ASSET_ID_OVERRIDES[symbol] ?? `${base}TMN`;

    rows.push({
      source: "wallex",
      assetId,
      category: categoriseBaseAsset(base),
      labelKey: labelKeyFor(assetId),
      upstreamName: {
        fa: market.faName?.trim() ?? null,
        en: market.enName?.trim() ?? null,
      },
      symbol,
      bid: bid === null ? null : bid * scale,
      ask: ask === null ? null : ask * scale,
      last: last === null ? null : last * scale,
      changePercent: IrPriceMapper.toNumber(market.stats?.["24h_ch"]),
      volume: IrPriceMapper.toNumber(market.stats?.["24h_volume"]),
    });
  }

  return rows;
}
