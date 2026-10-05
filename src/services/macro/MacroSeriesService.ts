import "server-only";

import { CachedSource } from "~/lib/cachedSource";
import { AppInject, AppSignleton } from "~/lib/container";
import { AxiosService } from "~/lib/axios";

import {
  compareFx,
  latestChange,
  mapFxRange,
  mapFxRates,
  mapWorldBankSeries,
  type FxSnapshot,
  type MacroSeries,
} from "./macroSeries.mapper";

/**
 * FX and macro series, free and keyless.
 *
 * Closes two real gaps in the app's macro coverage: there was no daily
 * reference FX series at all, and no inflation series. Both matter for a crypto
 * dashboard — a dollar that is strengthening is a headwind to dollar-priced risk,
 * and CPI is the denominator every nominal figure in the app should be read
 * against.
 *
 * Frankfurter is the **European Central Bank's own** published reference rates,
 * so it is a primary source. That matters more than it sounds: an aggregator's
 * FX rate is an average of whatever it could scrape, while the ECB fixes its
 * rates once a day at a known time.
 */

const FRANKFURTER = "https://api.frankfurter.app";
const WORLDBANK = "https://api.worldbank.org/v2";

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The ECB publishes on business days only, so this is a daily figure however
 * often it is read. Caching it for an hour costs nothing in freshness and stops
 * a dashboard refresh loop from re-reading the same closing rate.
 */
const FX_TTL_MS = 60 * 60_000;

/** World Bank CPI is annual and published with a lag; a day is generous. */
const WORLD_BANK_TTL_MS = 24 * 60_000;

/** Currencies the app plots. Frankfurter publishes ~30; these are the useful ones. */
const TRACKED_CURRENCIES = ["EUR", "GBP", "JPY", "CHF", "TRY", "CNY"] as const;

export type MacroSeriesReport = {
  fx: FxSnapshot;
  /** CPI for the countries a crypto reader most often compares against. */
  inflation: MacroSeries[];
  fetchedAt: number;
  stale: boolean;
  error: string | null;
};

@AppSignleton()
export default class MacroSeriesService {
  private readonly fx: CachedSource<Record<string, number | null>>;
  private readonly fxMeta: CachedSource<{ date: string | null }>;
  private readonly inflation: CachedSource<MacroSeries[]>;

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {
    this.fx = new CachedSource<Record<string, number | null>>({
      ttlMs: FX_TTL_MS,
      load: async () => {
        const { data } = await this.http.get<unknown>(
          `${FRANKFURTER}/latest?from=USD`,
          { timeout: REQUEST_TIMEOUT_MS },
        );
        const rates = mapFxRates(data);
        return Object.fromEntries(rates.map((rate) => [rate.currency, rate.perUsd]));
      },
      empty: () => ({}),
    });

    this.fxMeta = new CachedSource<{ date: string | null }>({
      ttlMs: FX_TTL_MS,
      load: async () => {
        const { data } = await this.http.get<unknown>(
          `${FRANKFURTER}/latest?from=USD`,
          { timeout: REQUEST_TIMEOUT_MS },
        );
        const date = (data as { date?: unknown })?.date;
        return { date: typeof date === "string" ? date : null };
      },
      empty: () => ({ date: null }),
    });

    this.inflation = new CachedSource<MacroSeries[]>({
      ttlMs: WORLD_BANK_TTL_MS,
      load: async () => this.loadInflation(),
      empty: () => [],
    });
  }

  /**
   * CPI for the US and the two economies that most often move this market.
   *
   * Fetched concurrently and settled independently: the World Bank is a single
   * upstream, so one country failing must not blank the others, and a country it
   * simply has not published yet is reported as null rather than omitted.
   */
  private async loadInflation(): Promise<MacroSeries[]> {
    const series = [
      { code: "USA", country: "United States", label: "CPI (2010 = 100)" },
      { code: "IRN", country: "Iran", label: "CPI (2010 = 100)" },
      { code: "TUR", country: "Türkiye", label: "CPI (2010 = 100)" },
    ];

    const settled = await Promise.allSettled(
      series.map(async (entry): Promise<MacroSeries> => {
        const params = new URLSearchParams({
          format: "json",
          per_page: "30",
          date: "2010:2026",
        });

        const { data } = await this.http.get<unknown>(
          `${WORLDBANK}/country/${entry.code}/indicator/FP.CPI.TOTL?${params.toString()}`,
          { timeout: REQUEST_TIMEOUT_MS },
        );

        const points = mapWorldBankSeries(data, {
          indicatorId: "FP.CPI.TOTL",
          label: entry.label,
          country: entry.country,
        });

        const stats = latestChange(points);

        return {
          indicatorId: "FP.CPI.TOTL",
          label: entry.label,
          country: entry.country,
          points: points.slice(0, 20),
          latest: stats.latest,
          latestYear: stats.latestYear,
          changePercent: stats.changePercent,
          fetchedAt: Date.now(),
          stale: false,
          error: null,
        };
      }),
    );

    return settled
      .filter(
        (result): result is PromiseFulfilledResult<MacroSeries> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value)
      .filter((series) => series.points.length > 0);
  }

  async getReport(options: { force?: boolean } = {}): Promise<MacroSeriesReport> {
    const [rates, meta, inflation] = await Promise.all([
      this.fx.read({ force: options.force }),
      this.fxMeta.read({ force: options.force }),
      this.inflation.read({ force: options.force }),
    ]);

    const selected = Object.fromEntries(
      TRACKED_CURRENCIES.map((currency) => [currency, rates.data[currency] ?? null]),
    );

    // The week-on-week move is a second read of a historical date rather than a
    // second source, so it costs nothing and needs no extra caching beyond the
    // FX TTL — the historical range is immutable once the ECB publishes it.
    let eurWeekChangePercent: number | null = null;
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 8 * 24 * 60 * 60 * 1000);
      const iso = (date: Date) => date.toISOString().slice(0, 10);

      const { data } = await this.http.get<unknown>(
        `${FRANKFURTER}/${iso(start)}..${iso(end)}?from=USD&to=EUR`,
        { timeout: REQUEST_TIMEOUT_MS },
      );

      const series = mapFxRange(data, "EUR");
      const earliest = series[0];
      const latestPoint = series.at(-1);

      // Compared against the earliest observation in the requested window rather
      // than against "a week ago exactly": the ECB does not publish on weekends,
      // so a fixed 7-day offset lands on a missing date and yields no change at
      // all roughly a third of the time.
      if (earliest && latestPoint) {
        eurWeekChangePercent = compareFx(
          { EUR: latestPoint.perUsd },
          { EUR: earliest.perUsd },
          "EUR",
        );
      }
    } catch {
      // A missing weekly change is not a failure of the report: the current
      // rates are the primary figure and the change is context.
      eurWeekChangePercent = null;
    }

    return {
      fx: {
        base: "USD",
        date: meta.data.date,
        rates: mapFxRates({ rates: rates.data }),
        selected,
        eurWeekChangePercent,
        fetchedAt: rates.fetchedAt,
        stale: rates.stale,
        error: rates.error,
      },
      inflation: inflation.data,
      fetchedAt: Math.max(rates.fetchedAt, inflation.fetchedAt),
      stale: rates.stale || inflation.stale,
      error: rates.error ?? inflation.error,
    };
  }
}