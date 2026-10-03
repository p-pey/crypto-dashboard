import "server-only";

import type { AiSectionId } from "~/services/ai/ai.port";
import { TextAiSection } from "~/services/ai/BaseAiSection";
import type {
  StatusMarketSnapshot,
  StatusNewsItem,
  StatusSignal,
  StatusTechnicals,
} from "./statuses.types";

/** The narrative panel's ceiling. The prompt asks for under 90 words. */
const MAX_SUMMARY_CHARS = 600;

export type StatusAiContext = {
  verdict: string;
  score: number;
  confidence: number;
  signals: StatusSignal[];
  technicals: StatusTechnicals | null;
  market: StatusMarketSnapshot | null;
  news: StatusNewsItem[];
  unavailable: string[];
};

/**
 * The coin-status narrative section.
 *
 * The second implementation of the section contract, and the reason the contract
 * is not shaped around the first. It asks for prose rather than JSON, samples
 * warmer, uses a short deadline because it runs on a cron, and has no schema at
 * all — all declared here, none of it duplicated.
 *
 * What actually changed by moving onto this base is reach: the section used to
 * know how to call three cloud vendors and nothing else, so it silently did
 * nothing when only a local model was running. Now it resolves a provider
 * through the registry and will use whatever is actually there.
 */
export default class StatusAiService extends TextAiSection<StatusAiContext> {
  readonly sectionId: AiSectionId = "statuses";

  protected readonly systemPrompt = [
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
   * Warmer than the analysis section on purpose.
   *
   * A verdict is a judgement about which signals matter most, and a cold model
   * tends to restate the input rather than weigh it.
   */
  protected override temperature(): number {
    return 0.4;
  }

  protected override maxTokens(): number {
    return 400;
  }

  /**
   * This runs on a cron, so it must not hold a slot for minutes.
   *
   * Note the tradeoff being made: a deadline this short is correct for a
   * scheduled job and wrong for the analysis page, which is why it is declared
   * per section rather than configured once globally.
   */
  protected override timeoutMs(): number {
    return 20_000;
  }

  /**
   * The data block, unchanged from when this prompt lived inside the analyser.
   *
   * Kept verbatim on purpose. Rewriting a prompt that is already producing
   * acceptable briefs in order to tidy it up would change output quality with no
   * way to tell whether it improved.
   */
  protected buildUserPrompt(context: StatusAiContext): string {
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

  /** Drops a stray code fence so the panel renders prose and nothing else. */
  protected override normaliseText(text: string): string {
    return text
      .replace(/^```[a-z]*\n?/i, "")
      .replace(/```$/, "")
      .trim()
      .slice(0, MAX_SUMMARY_CHARS);
  }
}
