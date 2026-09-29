import {
  NERKH_WINDOWS,
  type NerkhGroup,
  type NerkhQuote,
  type NerkhSnapshot,
  type NerkhWindow,
} from "./nerkh.types";

/**
 * Raw shape of `https://live.nerkh.io/api/prices?type=<group>`.
 *
 * The endpoint is undocumented and has no version marker, so every field is
 * treated as optional and coerced defensively: a malformed quote is dropped
 * rather than poisoning the whole snapshot.
 */
export type NerkhRawResponse = {
  data?: {
    message?: string;
    status?: number;
    timestamp?: number;
    date?: string;
    prices?: Record<
      string,
      {
        current?: string | number | null;
        min?: Partial<Record<NerkhWindow, string | number | null>>;
        max?: Partial<Record<NerkhWindow, string | number | null>>;
        update?: string | null;
      }
    >;
  };
  error?: string;
};

/** Upstream `type` query values, in the order they are crawled. */
export const NERKH_GROUP_QUERIES: Record<NerkhGroup, string> = {
  gold: "GOLD",
  currency: "CURRENCY",
  crypto: "CRYPTO",
};

export const NERKH_GROUP_ORDER: readonly NerkhGroup[] = [
  "gold",
  "currency",
  "crypto",
];

function toNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  // The feed sometimes formats with thousands separators or a trailing unit.
  const cleaned = value.replace(/[^\d.-]/g, "");
  if (cleaned.length === 0) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function windowPair(
  raw: Partial<Record<NerkhWindow, string | number | null>> | undefined,
): Record<NerkhWindow, number | null> {
  return {
    "1hour": toNumber(raw?.["1hour"]),
    "12hour": toNumber(raw?.["12hour"]),
  };
}

/**
 * Parses one group response. `previous` carries the spark series collected on
 * earlier crawls so the series survives across requests.
 */
export function mapGroupResponse(
  group: NerkhGroup,
  payload: unknown,
  previous: Map<string, number[]>,
): { quotes: NerkhQuote[]; timestamp: number | null; date: string | null } {
  const body = payload as NerkhRawResponse | null;
  const data = body?.data;
  const prices = data?.prices;

  if (!prices || typeof prices !== "object") {
    return { quotes: [], timestamp: null, date: null };
  }

  const quotes: NerkhQuote[] = [];

  for (const [key, raw] of Object.entries(prices)) {
    const current = toNumber(raw?.current);
    if (current === null || current <= 0) continue;

    const min = windowPair(raw?.min);
    const max = windowPair(raw?.max);

    // A quote whose 12h high sits below its low is corrupt upstream data.
    if (
      min["12hour"] !== null &&
      max["12hour"] !== null &&
      max["12hour"] < min["12hour"]
    ) {
      min["12hour"] = null;
      max["12hour"] = null;
    }

    const series = [...(previous.get(key) ?? [])];
    if (series[series.length - 1] !== current) {
      series.push(current);
    }

    quotes.push({
      key,
      group,
      current,
      min,
      max,
      updatedLabel: raw?.update?.trim() ?? "",
      spark: series.length > 1 ? series : series.slice(),
    });
  }

  const timestamp =
    typeof data?.timestamp === "number" && Number.isFinite(data.timestamp)
      ? data.timestamp * 1000
      : null;

  return {
    quotes,
    timestamp,
    date: typeof data?.date === "string" ? data.date : null,
  };
}

/** Collapses the per-group results into the single object the API returns. */
export function buildSnapshot(input: {
  quotes: NerkhQuote[];
  fetchedAt: number;
  timestamp: number | null;
  date: string | null;
  unavailable: string[];
  stale?: boolean;
  error?: string | null;
}): NerkhSnapshot {
  return {
    quotes: input.quotes,
    fetchedAt: input.fetchedAt,
    upstreamTimestamp: input.timestamp,
    upstreamDate: input.date,
    unavailable: input.unavailable,
    stale: input.stale ?? false,
    error: input.error ?? null,
  };
}

export const emptySnapshot = (error: string | null = null): NerkhSnapshot =>
  buildSnapshot({
    quotes: [],
    fetchedAt: Date.now(),
    timestamp: null,
    date: null,
    unavailable: [...NERKH_GROUP_ORDER],
    error,
  });

export { NERKH_WINDOWS };
