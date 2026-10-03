import { AppContainer } from "~/lib/container";
import { StatusesRepository } from "~/repository/statuses.repository";
import StatusAiService from "./StatusAiService";
import { StatusScorer } from "./StatusScorer";
import { StatusSourceService } from "./StatusSourceService";
import type {
  CoinStatus,
  StatusAnalyzeInput,
  StatusMarketSnapshot,
  StatusNewsItem,
  StatusSignal,
  StatusTechnicals,
} from "./statuses.types";

const Sources = AppContainer.resolve(StatusSourceService);
const Repo = AppContainer.resolve(StatusesRepository);
const Narrative = AppContainer.resolve(StatusAiService);

/**
 * Orchestrates one coin's daily analysis: collect every source in parallel,
 * score it deterministically, then optionally hand the result to a free LLM for
 * a written verdict.
 */
export class StatusAnalyzerService {
  private readonly inFlight = new Map<string, Promise<CoinStatus>>();

  /**
   * Concurrent requests for the same coin (double click, several tabs) share a
   * single upstream run instead of hammering every API twice.
   */
  async analyze(input: StatusAnalyzeInput): Promise<CoinStatus> {
    const coinId = input.coinId.trim().toLowerCase();

    if (!input.force) {
      const cached = Repo.get(coinId);
      if (cached) return cached;
    }

    const existing = this.inFlight.get(coinId);
    if (existing) return existing;

    const task = this.run(input).finally(() => {
      this.inFlight.delete(coinId);
    });

    this.inFlight.set(coinId, task);
    return task;
  }

  private async run(input: StatusAnalyzeInput): Promise<CoinStatus> {
    const now = Date.now();

    const [technicals, market, news, fear] = await Promise.all([
      Sources.collectTechnicals(input.symbol),
      Sources.collectCoinGecko(input.coinId),
      Sources.collectNews(input.name ?? input.symbol, input.symbol),
      Sources.collectFearAndGreed(),
    ]);

    const unavailable: string[] = [];
    if (technicals.error) unavailable.push(`technicals: ${technicals.error}`);
    if (market.error) unavailable.push(`coingecko: ${market.error}`);
    if (news.error) unavailable.push(`news: ${news.error}`);
    if (fear.error) unavailable.push(`fear&greed: ${fear.error}`);

    // Splice the market-wide Fear & Greed index into the per-coin snapshot.
    const mergedMarket: StatusMarketSnapshot | null = market.data
      ? {
          ...market.data,
          fearAndGreed: fear.data?.value ?? null,
          fearAndGreedLabel: fear.data?.label ?? null,
        }
      : null;

    const signals = StatusScorer.buildSignals({
      technicals: technicals.data,
      market: mergedMarket,
      news: news.data ?? [],
    });

    const { score, confidence } = StatusScorer.composite(signals);
    const verdict = StatusScorer.verdictFor(score);
    const narrative = await this.enhanceWithLlm({
      verdict,
      score,
      confidence,
      signals,
      technicals: technicals.data,
      market: mergedMarket,
      news: (news.data ?? []).slice(0, 6),
      unavailable,
    });

    const status: CoinStatus = {
      coinId: input.coinId,
      symbol: input.symbol.toUpperCase(),
      name: input.name ?? input.symbol.toUpperCase(),
      image: input.image ?? null,
      verdict,
      score: Math.round(score),
      summary: narrative.summary,
      generatedBy: narrative.generatedBy,
      llmProvider: narrative.provider,
      llmModel: narrative.model,
      llmError: narrative.error,
      signals,
      technicals: technicals.data,
      market: mergedMarket,
      news: (news.data ?? []).slice(0, 8),
      unavailableSources: unavailable,
      generatedAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
    };

    Repo.prune(now);
    return Repo.set(status);
  }

  /**
   * Asks the active model to turn the scored signals into prose.
   *
   * Any failure - no runtime, a dead key, a timeout, a refusal - falls back to
   * the deterministic narrative, so this step can never break a status. The
   * section never throws, so that guarantee costs one null check rather than a
   * try/catch.
   */
  private async enhanceWithLlm(context: {
    verdict: CoinStatus["verdict"];
    score: number;
    confidence: number;
    signals: StatusSignal[];
    technicals: StatusTechnicals | null;
    market: StatusMarketSnapshot | null;
    news: StatusNewsItem[];
    unavailable: string[];
  }): Promise<{
    summary: string;
    generatedBy: CoinStatus["generatedBy"];
    provider: string | null;
    model: string | null;
    error: string | null;
  }> {
    const fallback = {
      summary: StatusScorer.narrative(context.verdict, context.signals, {
        technicals: context.technicals,
        market: context.market,
        news: context.news,
      }),
      generatedBy: "deterministic" as const,
      provider: null,
      model: null,
      error: null as string | null,
    };

    const result = await Narrative.run(context);
    if (!result.data) return fallback;

    return {
      summary: result.data,
      generatedBy: "llm",
      provider: result.provider,
      model: result.model,
      error: null,
    };
  }
}
