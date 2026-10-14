import "server-only";

import { AppInject, AppSignleton } from "~/lib/container";
import { AxiosService } from "~/lib/axios";

import {
  parseBoardPage,
  parseCryptoUsdt,
  parseMarketsLocal,
} from "./tgju.mapper";
import type {
  TgjuExchangeRow,
  TgjuKey,
  TgjuQuote,
  TgjuSnapshot,
} from "./tgju.types";

const TGJU_BASE = "https://www.tgju.org";

/**
 * Which board page carries which instrument. Each entry is an independent
 * provider call: one page being down degrades the snapshot instead of
 * failing it, which is the automatic provider switching the board relies on
 * together with nerkh.io and the exchange websockets.
 */
const BOARD_PAGES = [
  { id: "currency", path: "/currency", wanted: { price_dollar_rl: "USD" } },
  {
    id: "gold",
    path: "/gold-chart",
    wanted: { geram18: "GOLD18K", geram24: "GOLD24K" },
  },
  {
    id: "coin",
    path: "/coin",
    wanted: { sekee: "SEKE_EMAMI", nim: "SEKE_NIM", rob: "SEKE_ROB" },
  },
] as const satisfies readonly {
  id: string;
  path: string;
  wanted: Record<string, TgjuKey>;
}[];

const CRYPTO_PAGE = "/crypto";
const MARKETS_LOCAL_PAGE = "/profile/crypto-tether/markets-local";

/** The boards are heavy HTML; a 30s cache keeps concurrent callers cheap. */
export const TGJU_TTL_MS = 30_000;

/** A single TGJU page may not hold up the others for longer than this. */
const PAGE_TIMEOUT_MS = 12_000;

const BROWSER_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fa,en;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Referer: "https://www.tgju.org/",
};

type Cached = { snapshot: TgjuSnapshot; expiresAt: number };

function emptySnapshot(error: string | null): TgjuSnapshot {
  return {
    quotes: [],
    exchanges: [],
    fetchedAt: Date.now(),
    unavailable: ["currency", "gold", "coin", "crypto", "markets-local"],
    stale: false,
    error,
  };
}

/**
 * Scrapes TGJU's server-rendered boards.
 *
 * The five pages are fetched concurrently and independently: an unreachable
 * page degrades the snapshot instead of failing it. A short lived cache keeps
 * several concurrent tRPC callers from hammering the upstream, and if a
 * refresh fails while a previous snapshot is still on hand the stale copy is
 * served with `stale: true` so the UI can say so — the board then falls back
 * to the nerkh.io rows for the same instruments.
 */
@AppSignleton()
export default class TgjuCrawlerService {
  private cache: Cached | null = null;
  /** De-duplicates concurrent callers so one crawl serves them all. */
  private inflight: Promise<TgjuSnapshot> | null = null;

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {}

  async getSnapshot(options: { force?: boolean } = {}): Promise<TgjuSnapshot> {
    if (!options.force && this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.snapshot;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.crawl().finally(() => {
      this.inflight = null;
    });

    return this.inflight;
  }

  private async fetchPage(path: string): Promise<string> {
    const { data } = await this.http.get<string>(`${TGJU_BASE}${path}`, {
      headers: BROWSER_HEADERS,
      timeout: PAGE_TIMEOUT_MS,
      responseType: "text",
    });
    return typeof data === "string" ? data : String(data);
  }

  private async crawl(): Promise<TgjuSnapshot> {
    const results = await Promise.allSettled([
      ...BOARD_PAGES.map((page) => this.fetchPage(page.path)),
      this.fetchPage(CRYPTO_PAGE),
      this.fetchPage(MARKETS_LOCAL_PAGE),
    ]);

    const quotes: TgjuQuote[] = [];
    const exchanges: TgjuExchangeRow[] = [];
    const unavailable: string[] = [];
    const errors: string[] = [];

    BOARD_PAGES.forEach((page, index) => {
      const result = results[index];
      if (result?.status !== "fulfilled") {
        unavailable.push(page.id);
        if (result?.status === "rejected")
          errors.push(describeError(result.reason));
        return;
      }
      const parsed = parseBoardPage(result.value, { ...page.wanted });
      if (parsed.length === 0) {
        unavailable.push(page.id);
        return;
      }
      quotes.push(...parsed);
    });

    const cryptoResult = results[BOARD_PAGES.length];
    if (cryptoResult?.status === "fulfilled") {
      const usdt = parseCryptoUsdt(cryptoResult.value);
      // The per-exchange table below is the primary USDT source; the board
      // aggregate is only a fallback so the quote survives a table outage.
      if (usdt && !quotes.some((quote) => quote.key === "USDT")) {
        quotes.push(usdt);
      }
    } else {
      unavailable.push("crypto");
      if (cryptoResult?.status === "rejected") {
        errors.push(describeError(cryptoResult.reason));
      }
    }

    const localResult = results[BOARD_PAGES.length + 1];
    if (localResult?.status === "fulfilled") {
      exchanges.push(...parseMarketsLocal(localResult.value));
      if (exchanges.length === 0) unavailable.push("markets-local");
    } else {
      unavailable.push("markets-local");
      if (localResult?.status === "rejected") {
        errors.push(describeError(localResult.reason));
      }
    }

    if (quotes.length === 0 && exchanges.length === 0) {
      const message = errors.join(" | ") || "tgju.org returned no prices";
      const previous = this.cache?.snapshot;
      if (
        previous &&
        (previous.quotes.length > 0 || previous.exchanges.length > 0)
      ) {
        return {
          ...previous,
          stale: true,
          error: message,
          unavailable: [...new Set([...previous.unavailable, ...unavailable])],
        };
      }
      return emptySnapshot(message);
    }

    const snapshot: TgjuSnapshot = {
      quotes,
      exchanges,
      fetchedAt: Date.now(),
      unavailable,
      stale: false,
      error: errors.length > 0 ? errors.join(" | ") : null,
    };

    this.cache = { snapshot, expiresAt: Date.now() + TGJU_TTL_MS };
    return snapshot;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("ECONNABORTED") || error.message === "timeout") {
      return "tgju.org timed out";
    }
    return error.message;
  }
  return "tgju.org request failed";
}
