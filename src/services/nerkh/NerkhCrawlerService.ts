import { AppInject, AppSignleton } from "~/lib/container";
import { AxiosService } from "~/lib/axios";

import {
  NERKH_GROUP_ORDER,
  NERKH_GROUP_QUERIES,
  buildSnapshot,
  emptySnapshot,
  mapGroupResponse,
} from "./nerkh.mapper";
import type { NerkhGroup, NerkhQuote, NerkhSnapshot } from "./nerkh.types";

/** Public endpoint behind live.nerkh.io. No key, no registration. */
const NERKH_LIVE_URL = "https://live.nerkh.io/api/prices";

/** nerkh.io republishes every few seconds; a 20s cache is well inside that. */
export const NERKH_TTL_MS = 20_000;

/** Rolling samples kept per instrument for the sparkline and drift estimate. */
const SPARK_LIMIT = 60;

/** A group may not hold up the others for longer than this. */
const GROUP_TIMEOUT_MS = 8_000;

const BROWSER_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "fa,en;q=0.8",
  // live.nerkh.io sits behind a WAF that rejects non-browser clients.
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Referer: "https://live.nerkh.io/",
};

type Cached = { snapshot: NerkhSnapshot; expiresAt: number };

/**
 * Crawls nerkh.io's live price endpoint.
 *
 * The three groups are fetched concurrently and independently: an unreachable
 * group degrades the snapshot instead of failing it. A short lived cache keeps
 * several concurrent tRPC callers from hammering the upstream, and if a refresh
 * fails while a previous snapshot is still on hand the stale copy is served
 * with `stale: true` so the UI can say so.
 */
@AppSignleton()
export default class NerkhCrawlerService {
  private cache: Cached | null = null;
  /** De-duplicates concurrent callers so one crawl serves them all. */
  private inflight: Promise<NerkhSnapshot> | null = null;
  private readonly sparks = new Map<string, number[]>();

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {}

  async getSnapshot(options: { force?: boolean } = {}): Promise<NerkhSnapshot> {
    if (!options.force && this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.snapshot;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.crawl().finally(() => {
      this.inflight = null;
    });

    return this.inflight;
  }

  private async crawl(): Promise<NerkhSnapshot> {
    const results = await Promise.allSettled(
      NERKH_GROUP_ORDER.map((group) => this.crawlGroup(group)),
    );

    const quotes: NerkhQuote[] = [];
    const unavailable: string[] = [];
    const errors: string[] = [];
    let timestamp: number | null = null;
    let date: string | null = null;

    results.forEach((result, index) => {
      const group = NERKH_GROUP_ORDER[index];
      if (result.status === "rejected") {
        unavailable.push(group ?? "unknown");
        errors.push(describeError(result.reason));
        return;
      }
      if (result.value.quotes.length === 0) {
        unavailable.push(group ?? "unknown");
        return;
      }
      quotes.push(...result.value.quotes);
      timestamp ??= result.value.timestamp;
      date ??= result.value.date;
    });

    if (quotes.length === 0) {
      const message = errors.join(" | ") || "nerkh.io returned no prices";
      const previous = this.cache?.snapshot;
      if (previous && previous.quotes.length > 0) {
        return {
          ...previous,
          stale: true,
          error: message,
          unavailable: [...new Set([...previous.unavailable, ...unavailable])],
        };
      }
      return emptySnapshot(message);
    }

    const snapshot = buildSnapshot({
      quotes,
      fetchedAt: Date.now(),
      timestamp,
      date,
      unavailable,
      stale: false,
      error: errors.length > 0 ? errors.join(" | ") : null,
    });

    this.cache = { snapshot, expiresAt: Date.now() + NERKH_TTL_MS };
    return snapshot;
  }

  private async crawlGroup(group: NerkhGroup): Promise<{
    quotes: NerkhQuote[];
    timestamp: number | null;
    date: string | null;
  }> {
    const query = NERKH_GROUP_QUERIES[group];
    const { data } = await this.http.get<unknown>(
      `${NERKH_LIVE_URL}?type=${encodeURIComponent(query)}`,
      { headers: BROWSER_HEADERS, timeout: GROUP_TIMEOUT_MS },
    );

    const previous = new Map(this.sparks);
    const parsed = mapGroupResponse(group, data, previous);

    for (const quote of parsed.quotes) {
      this.sparks.set(quote.key, quote.spark.slice(-SPARK_LIMIT));
    }

    return parsed;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("ECONNABORTED") || error.message === "timeout") {
      return "nerkh.io timed out";
    }
    return error.message;
  }
  return "nerkh.io request failed";
}
