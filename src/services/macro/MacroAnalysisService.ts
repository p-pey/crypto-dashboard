import { AppInject, AppSignleton } from "~/lib/container";
import type { MacroAsset } from "~/i18n/dictionaries/types";
import NewsCrawlerService from "~/services/news/NewsCrawlerService";
import type { NewsSnapshot } from "~/services/news/news.types";
import NerkhCrawlerService from "~/services/nerkh/NerkhCrawlerService";
import {
  findQuote,
  sparkChangePercent,
  windowBiasPercent,
  windowRangePercent,
  type NerkhQuote,
  type NerkhSnapshot,
} from "~/services/nerkh/nerkh.types";

import {
  HEADLINE_HORIZON,
  HORIZON_ORDER,
  HORIZON_PROFILE,
  MACRO_ASSETS,
  blendWeight,
} from "./horizons";
import type {
  AssetForecast,
  ForecastSignal,
  Horizon,
  HorizonForecast,
  MacroAnalysis,
  SignalKey,
} from "./macro.types";

/** nerkh.io instrument the projection is built on, per asset. */
const INSTRUMENT: Record<MacroAsset, string> = {
  usd: "USD",
  gold: "GOLD18K",
};

/**
 * Troy ounces per gram, and the 18 karat fineness. Together they convert the
 * global gold price into the Toman price of one gram of 18k, which is what
 * makes the local premium measurable.
 */
const GRAMS_PER_TROY_OUNCE = 31.1034768;
const EIGHTEEN_KARAT_FINENESS = 0.75;

const SIGNAL_ORDER: SignalKey[] = [
  "newsSentiment",
  "macroPressure",
  "momentum1h",
  "momentum12h",
  "intradayRange",
  "newsRecency",
  "goldPremium",
];

/**
 * Combines crawled Iranian news with live nerkh.io rates to project the dollar
 * and gold in Toman over five horizons.
 *
 * The model is deliberately deterministic and inspectable: eight macro
 * channels are scored from headline keywords, four price signals come from the
 * nerkh extremes, and each horizon applies its own published weight table. No
 * weights are learned, so every number in the response traces back to a
 * specific headline or a specific quote.
 */
@AppSignleton()
export default class MacroAnalysisService {
  constructor(
    @AppInject(NerkhCrawlerService)
    private readonly prices: NerkhCrawlerService,
    @AppInject(NewsCrawlerService) private readonly news: NewsCrawlerService,
  ) {}

  async analyze(options: { force?: boolean } = {}): Promise<MacroAnalysis> {
    const [news, price] = await Promise.all([
      this.news.getSnapshot({ force: options.force }),
      this.prices.getSnapshot({ force: options.force }),
    ]);

    const signals = this.buildSignals(news, price);

    return {
      generatedAt: Date.now(),
      forecasts: MACRO_ASSETS.map((asset) =>
        this.forecast(asset, signals, news, price),
      ),
      newsFetchedAt: news.fetchedAt,
      priceFetchedAt: price.fetchedAt,
      newsCoverage: news.coverage,
      unavailable: [
        ...news.unavailable.map((source) => `news:${source}`),
        ...price.unavailable.map((group) => `nerkh:${group}`),
      ],
      stale: news.stale || price.stale,
      error: news.error ?? price.error,
    };
  }

  private buildSignals(
    news: NewsSnapshot,
    price: NerkhSnapshot,
  ): Map<MacroAsset, Map<SignalKey, ForecastSignal>> {
    const usd = findQuote(price, INSTRUMENT.usd);
    const gold = findQuote(price, INSTRUMENT.gold);
    const ounce = findQuote(price, "OUNCE");

    const hasNews = news.articles.length > 0;
    const aggregate = signal(
      "newsSentiment",
      hasNews ? news.aggregate : 0,
      hasNews,
      hasNews ? `${news.articles.length} scored headlines` : "no headlines",
    );
    const pressure = this.pressureSignal(news);
    const recency = this.recencySignal(news);

    const shared = [
      aggregate,
      pressure,
      this.momentumSignal("momentum1h", usd, "1hour"),
      this.momentumSignal("momentum12h", usd, "12hour"),
      this.rangeSignal(usd),
      recency,
    ];

    const toMap = (entries: ForecastSignal[]): Map<SignalKey, ForecastSignal> =>
      new Map(entries.map((entry) => [entry.key, entry]));

    return new Map<MacroAsset, Map<SignalKey, ForecastSignal>>([
      [
        "usd",
        toMap([
          ...shared,
          signal("goldPremium", 0, false, "not applicable to the dollar"),
        ]),
      ],
      [
        "gold",
        toMap([
          ...shared,
          this.momentumSignal("momentum1h", gold, "1hour"),
          this.momentumSignal("momentum12h", gold, "12hour"),
          this.rangeSignal(gold),
          this.goldPremiumSignal(usd, gold, ounce),
        ]),
      ],
    ]);
  }

  /**
   * Weighted composite of the eight macro channels. The weights encode how
   * directly each one moves the rial: the FX market and sanctions dominate,
   * political risk sits in between, gold demand barely counts for the currency
   * and much more for the metal.
   */
  private pressureSignal(news: NewsSnapshot): ForecastSignal {
    const W: Record<string, number> = {
      fx_market: 1.6,
      sanctions: 1.4,
      monetary: 1.2,
      inflation: 1.2,
      oil_energy: 1,
      budget: 0.9,
      political_risk: 1,
      gold_demand: 0.4,
    };

    let sum = 0;
    let total = 0;
    let contributors = 0;
    let channels = 0;

    for (const reading of news.drivers) {
      const weight = W[reading.id] ?? 1;
      total += weight;
      if (!reading.available) continue;
      sum += reading.score * weight;
      contributors += reading.articles;
      channels += 1;
    }

    const available = contributors > 0 && total > 0;

    return signal(
      "macroPressure",
      available ? sum / total : 0,
      available,
      available
        ? `${contributors} headlines across ${channels} channels`
        : "no macro coverage",
    );
  }

  /**
   * How current the news actually is. Reported alongside the directional
   * signals but excluded from the weighted sum, because a stale feed should
   * reduce confidence rather than push the projection in any direction.
   */
  private recencySignal(news: NewsSnapshot): ForecastSignal {
    if (news.articles.length === 0) {
      return signal("newsRecency", 0, false, "no headlines");
    }

    const freshest = news.articles.reduce(
      (best, article) => Math.max(best, article.publishedAt),
      0,
    );
    const ageMinutes = (Date.now() - freshest) / 60_000;
    // Full marks under 30 minutes, nothing after four hours.
    const score = clamp(100 - (ageMinutes / 240) * 100, 0, 100);

    return signal(
      "newsRecency",
      score,
      true,
      `freshest headline ${Math.round(ageMinutes)} min old`,
    );
  }

  /**
   * Where the price sits inside its 1h/12h range, normalised to -100..100.
   * Pinned to the top of the range is bullish continuation pressure, pinned to
   * the bottom bearish.
   */
  private momentumSignal(
    key: "momentum1h" | "momentum12h",
    quote: NerkhQuote | undefined,
    window: "1hour" | "12hour",
  ): ForecastSignal {
    if (!quote) return signal(key, 0, false, "quote unavailable");

    const label = window === "1hour" ? "1h" : "12h";
    const bias = windowBiasPercent(quote, window);

    if (bias === null) {
      // A flat window (high === low) is normal for a quiet market and carries
      // no position information. Fall back to the drift the crawler observed
      // before giving up on the signal entirely.
      const drift = sparkChangePercent(quote);
      if (drift === null) {
        return signal(key, 0, false, `flat ${label} range, no history yet`);
      }
      return signal(
        key,
        clamp(drift * 4, -100, 100),
        true,
        `flat ${label} range · ${drift > 0 ? "+" : ""}${drift.toFixed(2)}% observed`,
      );
    }

    // Blend the in-window position with the observed drift. The position is
    // reliable immediately; the drift needs time to warm up.
    const drift = sparkChangePercent(quote);
    const combined = drift === null ? bias : bias * 0.7 + drift * 0.3;

    return signal(
      key,
      clamp(combined * 4, -100, 100),
      true,
      `${Math.round(bias * 100)}% of the ${label} range`,
    );
  }

  /**
   * Range *width* is volatility, not direction, so this signal is signed by
   * which edge the price is closer to: a wide range closed near the low is
   * selling pressure even though the width alone says nothing.
   *
   * A flat window is reported as available with a zero score: "nothing moved"
   * is a real observation about the market, not missing data.
   */
  private rangeSignal(quote: NerkhQuote | undefined): ForecastSignal {
    if (!quote) return signal("intradayRange", 0, false, "quote unavailable");

    const low = quote.min["1hour"];
    const high = quote.max["1hour"];
    if (low === null || high === null || high <= 0) {
      return signal("intradayRange", 0, false, "1h range missing");
    }

    const width = ((high - low) / quote.current) * 100;
    if (high <= low) {
      return signal("intradayRange", 0, true, "flat 1h range");
    }

    const position = (quote.current - low) / (high - low); // 0..1
    const score = clamp(
      (position - 0.5) * 2 * clamp(width / 2, 0, 1.5) * 100,
      -100,
      100,
    );

    return signal(
      "intradayRange",
      score,
      true,
      `${width.toFixed(2)}% 1h range`,
    );
  }

  /**
   * Local gold premium: the Toman price of an 18k gram against the price
   * implied by the global ounce and the dollar rate. A premium above 1 means
   * domestic demand or import friction is adding to the metal, which is the
   * most reliable gold-only signal this data supports.
   */
  private goldPremiumSignal(
    usd: NerkhQuote | undefined,
    gold: NerkhQuote | undefined,
    ounce: NerkhQuote | undefined,
  ): ForecastSignal {
    if (!usd || !gold || !ounce) {
      return signal("goldPremium", 0, false, "needs USD, GOLD18K and OUNCE");
    }

    const implied =
      (ounce.current / GRAMS_PER_TROY_OUNCE) *
      EIGHTEEN_KARAT_FINENESS *
      usd.current;

    if (!Number.isFinite(implied) || implied <= 0) {
      return signal("goldPremium", 0, false, "implied price not computable");
    }

    const premium = gold.current / implied;
    // Beyond these bounds the ratio is a data error rather than a premium.
    if (premium > 1.6 || premium < 0.6) {
      return signal(
        "goldPremium",
        0,
        false,
        `implausible premium ${premium.toFixed(2)}`,
      );
    }

    const premiumPercent = premium * 100 - 100;
    // 1.00 -> 0, 1.10 -> +100, 0.90 -> -100.
    const score = clamp(((premium - 1) / 0.1) * 100, -100, 100);
    const gold12h = windowRangePercent(gold, "12hour") ?? 0;

    return signal(
      "goldPremium",
      score,
      true,
      `${premiumPercent >= 0 ? "+" : ""}${premiumPercent.toFixed(1)}% over global · gold +${gold12h.toFixed(2)}% in 12h`,
    );
  }

  private forecast(
    asset: MacroAsset,
    signals: Map<MacroAsset, Map<SignalKey, ForecastSignal>>,
    news: NewsSnapshot,
    price: NerkhSnapshot,
  ): AssetForecast {
    const quote = findQuote(price, INSTRUMENT[asset]);
    const spot = quote?.current ?? null;
    const byKey = signals.get(asset) ?? new Map<SignalKey, ForecastSignal>();

    const byHorizon: HorizonForecast[] = HORIZON_ORDER.map((horizon) => {
      const { composite, coverage } = this.blend(asset, horizon, byKey);
      const { volatilityPercent, confidenceFactor } = HORIZON_PROFILE[horizon];

      const driftPercent = (composite / 100) * volatilityPercent;
      // News coverage multiplies in: a model reading one live outlet is
      // genuinely less certain than one reading all six.
      const confidence = clamp(
        coverage * news.coverage * confidenceFactor,
        0.05,
        1,
      );

      return {
        horizon,
        volatilityPercent,
        composite,
        coverage,
        confidence,
        driftPercent,
        verdict: verdictFor(composite, confidence),
        band:
          spot === null
            ? null
            : {
                mid: Math.round(spot * (1 + driftPercent / 100)),
                low: Math.round(
                  spot *
                    (1 + (driftPercent - volatilityPercent * confidence) / 100),
                ),
                high: Math.round(
                  spot *
                    (1 + (driftPercent + volatilityPercent * confidence) / 100),
                ),
              },
      };
    });

    const headline =
      byHorizon.find((f) => f.horizon === HEADLINE_HORIZON) ?? null;

    return {
      asset,
      instrument: INSTRUMENT[asset],
      spot,
      byHorizon,
      headline,
      signals: SIGNAL_ORDER.map(
        (key) => byKey.get(key) ?? signal(key, 0, false, "not evaluated"),
      ),
      rationale: rationale(byKey, asset, headline?.composite ?? 0),
      available: spot !== null && byHorizon.some((f) => f.coverage > 0),
    };
  }

  /**
   * Weighted average of the signals that carry weight for this (asset,
   * horizon). Unavailable signals are dropped rather than counted as neutral,
   * so a dead feed narrows the base instead of dragging the score to zero.
   */
  private blend(
    asset: MacroAsset,
    horizon: Horizon,
    byKey: Map<SignalKey, ForecastSignal>,
  ): { composite: number; coverage: number } {
    let sum = 0;
    let weight = 0;
    let availableWeight = 0;

    for (const key of SIGNAL_ORDER) {
      const w = blendWeight(key, asset, horizon);
      if (w === 0) continue;

      weight += w;
      const entry = byKey.get(key);
      if (!entry?.available) continue;

      availableWeight += w;
      sum += entry.score * w;
    }

    if (weight === 0 || availableWeight === 0) {
      return { composite: 0, coverage: 0 };
    }

    return {
      composite: sum / availableWeight,
      coverage: availableWeight / weight,
    };
  }
}

function rationale(
  byKey: Map<SignalKey, ForecastSignal>,
  asset: MacroAsset,
  composite: number,
): string[] {
  // Rank by the signal's own weight in the widest horizon, so the bullets
  // always describe what the long term view is actually built on.
  const relevant = [...byKey.values()]
    .filter(
      (entry) => entry.available && blendWeight(entry.key, asset, "yearly") > 0,
    )
    .sort(
      (a, b) =>
        Math.abs(b.score) * blendWeight(b.key, asset, "yearly") -
        Math.abs(a.score) * blendWeight(a.key, asset, "yearly"),
    )
    .slice(0, 4);

  if (relevant.length === 0) {
    return ["No signal had usable data for this asset."];
  }

  return [
    `Composite reads ${Math.round(composite)} — ${
      composite >= 0 ? "upward" : "downward"
    } pressure on the rial.`,
    ...relevant.map(
      (entry) =>
        `${entry.key} ${entry.score > 0 ? "+" : ""}${Math.round(entry.score)} · ${entry.detail}`,
    ),
  ];
}

function signal(
  key: SignalKey,
  score: number,
  available: boolean,
  detail: string,
): ForecastSignal {
  return { key, score: clamp(score, -100, 100), available, detail };
}

function verdictFor(
  composite: number,
  confidence: number,
): "bullish" | "bearish" | "neutral" {
  // A weak signal on thin coverage should read as neutral, not as a call.
  const threshold = 12 + (1 - confidence) * 25;
  if (composite >= threshold) return "bullish";
  if (composite <= -threshold) return "bearish";
  return "neutral";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
