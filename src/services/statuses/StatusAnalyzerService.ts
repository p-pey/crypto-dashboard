import { AppContainer } from "~/lib/container";
import { StatusesRepository } from "~/repository/statuses.repository";
import { completeWithLlm, resolveLlmConfig } from "./StatusLlmService";
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

const SYSTEM_PROMPT = [
  "You are a cautious crypto market analyst writing a short brief for a trading dashboard.",
  "You are given pre-computed technical, on-chain, community and news signals for ONE coin.",
  "Rules:",
  "- Never invent numbers. Every figure you cite must appear in the input.",
  "- Do not promise returns or give financial advice.",
  "- Keep it under 90 words, plain prose, no markdown headings or bullet lists.",
  "- Start with one of: STRONG BUY, BUY, HOLD, REDUCE, AVOID.",
  "- Then justify it from the strongest signals and name the main risk.",
  "- If signals conflict, say so plainly rather than forcing a call.",
].join("\n");

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
   * Asks the configured free LLM to turn the scored signals into prose. Any
   * failure - no key, bad key, timeout, refusal - falls back to the deterministic
   * narrative, so this step can never break a status.
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

    const config = resolveLlmConfig();
    if (!config) return fallback;

    const result = await completeWithLlm(
      config,
      SYSTEM_PROMPT,
      buildUserPrompt(context),
    );

    const text = result.text?.trim();
    if (!text) {
      return {
        ...fallback,
        provider: result.provider,
        model: result.model,
        error: result.error ?? "llm returned empty text",
      };
    }

    return {
      summary: text,
      generatedBy: "llm",
      provider: result.provider,
      model: result.model,
      error: null,
    };
  }
}

function buildUserPrompt(context: {
  verdict: string;
  score: number;
  confidence: number;
  signals: StatusSignal[];
  technicals: StatusTechnicals | null;
  market: StatusMarketSnapshot | null;
  news: StatusNewsItem[];
  unavailable: string[];
}): string {
  const lines: string[] = [];

  lines.push(
    `Composite score: ${context.score.toFixed(1)} on a -100..+100 scale.`,
  );
  lines.push(`Deterministic verdict: ${context.verdict}.`);
  lines.push(`Signal coverage: ${context.confidence.toFixed(0)}%.`);
  lines.push("");

  lines.push("Signals:");
  for (const signal of context.signals) {
    lines.push(
      signal.available
        ? `- ${signal.label}: score ${signal.score.toFixed(0)} (${signal.detail})`
        : `- ${signal.label}: UNAVAILABLE (${signal.detail})`,
    );
  }

  if (context.technicals) {
    lines.push("");
    lines.push("Technicals (1h candles):");
    lines.push(`- price ${context.technicals.price}`);
    lines.push(`- RSI14 ${context.technicals.rsi14?.toFixed(1) ?? "n/a"}`);
    lines.push(
      `- MACD histogram ${context.technicals.macdHistogram?.toFixed(6) ?? "n/a"}`,
    );
    lines.push(
      `- ATR ${context.technicals.atrPct?.toFixed(2) ?? "n/a"}% of price`,
    );
    lines.push(`- 24h ${context.technicals.change24h?.toFixed(2) ?? "n/a"}%`);
    lines.push(`- 7d ${context.technicals.change7d?.toFixed(2) ?? "n/a"}%`);
  }

  if (context.market) {
    lines.push("");
    lines.push("Market / community:");
    lines.push(`- market cap rank ${context.market.marketCapRank ?? "n/a"}`);
    lines.push(`- bullish votes ${context.market.votesUpPercent ?? "n/a"}%`);
    lines.push(`- watchlist users ${context.market.watchlistUsers ?? "n/a"}`);
    lines.push(`- from ATH ${context.market.athChangePercent ?? "n/a"}%`);
    lines.push(
      `- fear & greed ${context.market.fearAndGreed ?? "n/a"} (${context.market.fearAndGreedLabel ?? "n/a"})`,
    );
  }

  if (context.news.length > 0) {
    lines.push("");
    lines.push("Recent headlines (sentiment -1..1):");
    for (const item of context.news) {
      lines.push(
        `- [${item.sentiment.toFixed(2)}] ${item.title} (${item.source})`,
      );
    }
  }

  if (context.unavailable.length > 0) {
    lines.push("");
    lines.push(`Sources that failed: ${context.unavailable.join("; ")}`);
  }

  return lines.join("\n");
}
