import { clamp, scaleAroundNeutral } from "./indicators";
import type {
  StatusMarketSnapshot,
  StatusNewsItem,
  StatusSignal,
  StatusTechnicals,
  StatusVerdict,
} from "./statuses.types";

export type ScoreInput = {
  technicals: StatusTechnicals | null;
  market: StatusMarketSnapshot | null;
  news: StatusNewsItem[];
};

/**
 * Weighted, explainable composite of every available signal.
 *
 * Signals whose upstream source failed are excluded from both the numerator and
 * the weight total, so a missing source can never drag the verdict toward
 * neutral - it only reduces confidence, which is reported separately.
 */
export class StatusScorer {
  static buildSignals({
    technicals,
    market,
    news,
  }: ScoreInput): StatusSignal[] {
    return [
      this.trendSignal(technicals),
      this.momentumSignal(technicals),
      this.rsiSignal(technicals),
      this.macdSignal(technicals),
      this.volatilitySignal(technicals),
      this.volumeSignal(market),
      this.communitySignal(market),
      this.athDistanceSignal(market),
      this.newsSignal(news),
      this.fearSignal(market),
    ];
  }

  static composite(signals: StatusSignal[]): {
    score: number;
    confidence: number;
  } {
    const usable = signals.filter((signal) => signal.available);
    if (usable.length === 0) return { score: 0, confidence: 0 };

    const totalWeight = usable.reduce((acc, signal) => acc + signal.weight, 0);
    if (totalWeight === 0) return { score: 0, confidence: 0 };

    const weighted = usable.reduce(
      (acc, signal) => acc + signal.score * signal.weight,
      0,
    );
    const score = clamp(weighted / totalWeight, -100, 100);

    // Full confidence only when most of the signal budget actually resolved.
    const confidence = clamp(
      (totalWeight / signals.reduce((acc, signal) => acc + signal.weight, 0)) *
        100,
      0,
      100,
    );

    return { score, confidence };
  }

  static verdictFor(score: number): StatusVerdict {
    if (score >= 45) return "strong_buy";
    if (score >= 15) return "buy";
    if (score > -15) return "neutral";
    if (score > -45) return "reduce";
    return "avoid";
  }

  /**
   * Fallback prose used when no LLM is configured or the LLM call failed. Every
   * clause is derived from a signal so the text always agrees with the score.
   */
  static narrative(
    verdict: StatusVerdict,
    signals: StatusSignal[],
    input: ScoreInput,
  ): string {
    const label: Record<StatusVerdict, string> = {
      strong_buy: "Strongly favourable",
      buy: "Favourable",
      neutral: "Neutral / wait",
      reduce: "Cautious",
      avoid: "Unfavourable",
    };

    const usable = signals.filter((signal) => signal.available);
    const bullish = usable
      .filter((signal) => signal.score >= 20)
      .sort((a, b) => b.score * b.weight - a.score * a.weight);
    const bearish = usable
      .filter((signal) => signal.score <= -20)
      .sort((a, b) => a.score * a.weight - b.score * a.weight);

    const drivers = [
      ...bullish.slice(0, 2).map((s) => s.label.toLowerCase()),
      ...bearish.slice(0, 2).map((s) => s.label.toLowerCase()),
    ];

    const parts: string[] = [
      `${label[verdict]}. Signals point ${
        verdict === "strong_buy" || verdict === "buy"
          ? "upward"
          : verdict === "reduce" || verdict === "avoid"
            ? "downward"
            : "in both directions"
      }.`,
    ];

    if (drivers.length > 0) {
      parts.push(`Drivers: ${joinList(drivers)}.`);
    }

    if (
      input.technicals?.price !== null &&
      input.technicals?.price !== undefined
    ) {
      parts.push(`Last price $${input.technicals.price.toLocaleString()}.`);
    }

    const missing = signals.filter((signal) => !signal.available);
    if (missing.length > 0) {
      parts.push(
        `${missing.length} of ${signals.length} signals were unavailable, so treat this as a partial read.`,
      );
    }

    parts.push("Not financial advice.");
    return parts.join(" ");
  }

  // --- individual signals ---------------------------------------------------

  /** Price relative to the 20/50/200 period moving averages. */
  private static trendSignal(tech: StatusTechnicals | null): StatusSignal {
    const base = {
      key: "trend" as const,
      label: "Trend",
      weight: 20,
    };

    if (tech?.price === null || tech?.price === undefined) {
      return { ...base, score: 0, detail: "no price series", available: false };
    }

    const parts: string[] = [];
    let score = 0;
    let counted = 0;

    for (const [name, value] of [
      ["SMA20", tech.sma20],
      ["SMA50", tech.sma50],
      ["SMA200", tech.sma200],
    ] as const) {
      if (value === null || value === undefined) continue;
      const distance = ((tech.price - value) / value) * 100;
      counted += 1;
      // Being 3% above a MA is treated as a full-strength signal.
      score += clamp(distance * 33, -100, 100);
      parts.push(
        `${distance >= 0 ? "+" : ""}${distance.toFixed(1)}% vs ${name}`,
      );
    }

    if (counted === 0) {
      return {
        ...base,
        score: 0,
        detail: "no moving averages",
        available: false,
      };
    }

    return {
      ...base,
      score: clamp(score / counted),
      detail: parts.join(", "),
      available: true,
    };
  }

  private static momentumSignal(tech: StatusTechnicals | null): StatusSignal {
    const base = {
      key: "momentum" as const,
      label: "Momentum",
      weight: 12,
    };

    const week = tech?.change7d;
    const day = tech?.change24h;
    if (week === null || week === undefined) {
      return { ...base, score: 0, detail: "no 7d history", available: false };
    }

    // A 7d move of +/-15% is full strength.
    const score = clamp(
      (week / 15) * 100 * 0.7 + clamp(((day ?? 0) / 6) * 100) * 0.3,
    );

    return {
      ...base,
      score,
      detail: `7d ${week.toFixed(1)}%, 24h ${(day ?? 0).toFixed(1)}%`,
      available: true,
    };
  }

  private static rsiSignal(tech: StatusTechnicals | null): StatusSignal {
    const base = {
      key: "rsi" as const,
      label: "RSI",
      weight: 15,
    };

    const value = tech?.rsi14;
    if (value === null || value === undefined) {
      return {
        ...base,
        score: 0,
        detail: "not enough candles",
        available: false,
      };
    }

    // RSI 70 = overbought (bearish), 30 = oversold (bullish), 50 = neutral.
    const score =
      value >= 50
        ? -scaleAroundNeutral(value, 50, 50, 80)
        : -scaleAroundNeutral(value, 50, 20, 50);

    const zone =
      value >= 70 ? "overbought" : value <= 30 ? "oversold" : "neutral zone";

    return {
      ...base,
      score: clamp(score),
      detail: `RSI14 ${value.toFixed(1)} (${zone})`,
      available: true,
    };
  }

  private static macdSignal(tech: StatusTechnicals | null): StatusSignal {
    const base = {
      key: "macd" as const,
      label: "MACD",
      weight: 15,
    };

    const histogram = tech?.macdHistogram;
    const price = tech?.price;
    if (
      histogram === null ||
      histogram === undefined ||
      price === null ||
      price === undefined
    ) {
      return {
        ...base,
        score: 0,
        detail: "not enough candles",
        available: false,
      };
    }

    // Normalise the histogram by price so it is comparable across coins.
    const normalized = (histogram / price) * 100;
    const score = clamp(normalized * 400);

    return {
      ...base,
      score,
      detail: `histogram ${normalized.toFixed(3)}% of price${
        normalized >= 0 ? " (bullish cross)" : " (bearish cross)"
      }`,
      available: true,
    };
  }

  private static volatilitySignal(tech: StatusTechnicals | null): StatusSignal {
    const base = {
      key: "volatility" as const,
      label: "Volatility",
      weight: 8,
    };

    const atr = tech?.atrPct;
    if (atr === null || atr === undefined) {
      return { ...base, score: 0, detail: "no ATR", available: false };
    }

    // High ATR is not directional; treat it as a mild risk penalty that also
    // lowers conviction, which the confidence figure reflects.
    const score = -clamp((atr / 3) * 100);

    return {
      ...base,
      score,
      detail: `ATR ${atr.toFixed(2)}% of price per hour`,
      available: true,
    };
  }

  private static volumeSignal(
    market: StatusMarketSnapshot | null,
  ): StatusSignal {
    const base = {
      key: "volume" as const,
      label: "Volume",
      weight: 8,
    };

    const change = market?.priceChangePercent24h;
    const volume = market?.totalVolume;
    if (change === null || change === undefined) {
      return { ...base, score: 0, detail: "no 24h change", available: false };
    }

    // Big moves on big volume are more trustworthy than thin spikes.
    const conviction = Math.min(Math.log10(Math.max(volume ?? 0, 1)) / 12, 1);
    const score = clamp((change / 8) * 100) * (0.5 + 0.5 * conviction);

    return {
      ...base,
      score,
      detail: `24h ${change.toFixed(2)}% on $${Math.round(volume ?? 0).toLocaleString()} volume`,
      available: true,
    };
  }

  private static communitySignal(
    market: StatusMarketSnapshot | null,
  ): StatusSignal {
    const base = {
      key: "community" as const,
      label: "Community",
      weight: 12,
    };

    const up = market?.votesUpPercent;
    if (up === null || up === undefined) {
      return { ...base, score: 0, detail: "no vote data", available: false };
    }

    // 50% neutral, 90%+ euphoric (cap the contribution before it turns contrarian).
    const score = clamp(scaleAroundNeutral(up, 50, 20, 90));

    return {
      ...base,
      score,
      detail: `${up.toFixed(1)}% of CoinGecko votes are bullish${
        market?.watchlistUsers
          ? `, ${market.watchlistUsers.toLocaleString()} watchlist users`
          : ""
      }`,
      available: true,
    };
  }

  private static athDistanceSignal(
    market: StatusMarketSnapshot | null,
  ): StatusSignal {
    const base = {
      key: "ath_distance" as const,
      label: "ATH distance",
      weight: 5,
    };

    const ath = market?.athChangePercent;
    if (ath === null || ath === undefined) {
      return { ...base, score: 0, detail: "no ATH data", available: false };
    }

    // Sitting far below the high is treated as room to recover; -5% = at the high.
    const score = clamp(scaleAroundNeutral(ath, -5, -80, 0));

    return {
      ...base,
      score,
      detail: `${ath.toFixed(1)}% from all-time high`,
      available: true,
    };
  }

  private static newsSignal(news: StatusNewsItem[]): StatusSignal {
    const base = {
      key: "news" as const,
      label: "News tone",
      weight: 18,
    };

    if (news.length === 0) {
      return { ...base, score: 0, detail: "no headlines", available: false };
    }

    const mean =
      news.reduce((acc, item) => acc + item.sentiment, 0) / news.length;
    const positive = news.filter((item) => item.sentiment > 0.1).length;
    const negative = news.filter((item) => item.sentiment < -0.1).length;

    return {
      ...base,
      score: clamp(mean * 100),
      detail: `${positive} positive / ${negative} negative of ${news.length} headlines`,
      available: true,
    };
  }

  private static fearSignal(market: StatusMarketSnapshot | null): StatusSignal {
    const base = {
      key: "market_fear" as const,
      label: "Market sentiment",
      weight: 10,
    };

    const value = market?.fearAndGreed;
    if (value === null || value === undefined) {
      return {
        ...base,
        score: 0,
        detail: "index unavailable",
        available: false,
      };
    }

    // The index is a crowding indicator: extreme greed is a mild negative.
    const score =
      value >= 50
        ? -scaleAroundNeutral(value, 50, 50, 95)
        : -scaleAroundNeutral(value, 50, 5, 50);

    return {
      ...base,
      score,
      detail: `fear & greed ${value} (${market?.fearAndGreedLabel ?? "n/a"})`,
      available: true,
    };
  }
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
