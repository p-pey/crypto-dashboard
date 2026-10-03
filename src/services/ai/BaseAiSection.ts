import "server-only";

import type { z } from "zod";

import type { AiProviderId, AiSectionId, AiStatus } from "./ai.port";
import { aiRegistry } from "./AiRegistry";
import type { BaseAiProvider } from "./BaseAiProvider";

/**
 * The base for every feature area that asks a model for something.
 *
 * This is the class the application extends when a new panel needs a model.
 * Everything a section actually needs from an AI runtime is here — reachability,
 * a deadline, structured output, validation, and a deterministic fallback when
 * the model is off — so a new section is one file that answers four questions
 * and nothing else:
 *
 * 1. what is it called ({@link sectionId}),
 * 2. what does the model read ({@link systemPrompt} and {@link buildUserPrompt}),
 * 3. what shape must the answer take ({@link schema}),
 * 4. what has to be forced into shape afterwards ({@link normalise}).
 *
 * A section knows nothing about which runtime answers, or how. Pointing it at a
 * local model instead of a cloud key is a configuration change, not a code
 * change, which is the entire reason this sits between the port and the feature.
 *
 * Two conventions sections inherit and must keep:
 *
 * - **A section never throws.** An unreachable or unhelpful model comes back as
 *   `data: null` with an `error`, because every caller has a deterministic
 *   answer to show instead and an exception would take that down too.
 * - **The output is validated before it leaves.** `normalise` is the last place
 *   a value can be forced into a shape no schema can express — three
 *   probabilities that must sum to 100, a string length cap, a sort. It runs
 *   only on a reply that already passed {@link schema}.
 */
export abstract class BaseAiSection<TContext, TOutput> {
  /** Stable id, used in logs and in the provenance line the UI shows. */
  abstract readonly sectionId: AiSectionId;

  /** The persona and the hard rules. Never contains data. */
  protected abstract readonly systemPrompt: string;

  /**
   * The answer's shape, or `null` when this section wants prose.
   *
   * Most sections declare a schema and get validated structured output. The ones
   * that genuinely want written prose — a narrative brief, a summary for a human
   * to read — declare `null` and extend {@link TextAiSection}, which is this same
   * base with the JSON machinery switched off.
   *
   * A reply that does not fit its schema is discarded, never coerced.
   */
  protected abstract readonly schema: z.ZodType<TOutput> | null;

  /** Renders the section's data block. Numbers, not prose, wherever possible. */
  protected abstract buildUserPrompt(context: TContext): string;

  /**
   * The section's last word on a validated answer.
   *
   * The default is a pass-through. Override for anything the schema cannot
   * express — a probability distribution that has to total 100, a sort order, a
   * length cap. Keep it total, because there is no partial repair here.
   */
  protected normalise(output: TOutput): TOutput {
    return output;
  }

  /**
   * Post-processing for prose sections.
   *
   * Unused when {@link schema} is set. Overriding it in a structured section is a
   * mistake: {@link normalise} is the hook for those.
   */
  protected normaliseText(text: string): string {
    return text;
  }

  /** Deadline for one completion. Local models need far longer than cloud ones. */
  protected timeoutMs(): number {
    return 180_000;
  }

  /** Sampling. Structured reads want cold; a written brief wants warmer. */
  protected temperature(): number {
    return 0.2;
  }

  /** Upper bound on the reply, in tokens. */
  protected maxTokens(): number {
    return 900;
  }

  /** The runtime this section will use, honouring the app's provider order. */
  protected async provider(): Promise<BaseAiProvider> {
    return aiRegistry().active();
  }

  /** Which providers can answer right now, for the UI's status line. */
  async status(): Promise<AiStatus[]> {
    return aiRegistry().statuses();
  }

  /**
   * Runs one completion for this section.
   *
   * `providerId` is only for tests and for a UI that wants to pin a specific
   * runtime; leave it unset in application code and the registry decides.
   */
  async run(
    context: TContext,
    options: {
      providerId?: AiProviderId;
      signal?: AbortSignal;
      timeoutMs?: number;
    } = {},
  ): Promise<AiSectionResult<TOutput>> {
    const provider = options.providerId
      ? aiRegistry().get(options.providerId)
      : await this.provider();

    const request = {
      messages: [
        { role: "system" as const, content: this.systemPrompt },
        { role: "user" as const, content: this.buildUserPrompt(context) },
      ],
      temperature: this.temperature(),
      maxTokens: this.maxTokens(),
    };
    const timeoutMs = options.timeoutMs ?? this.timeoutMs();

    const schema = this.schema;

    // Prose path. The text *is* the answer, so it is trimmed and handed back
    // through the same result shape a validated object uses, so callers above
    // this class never branch on which kind of section they hold.
    if (!schema) {
      const prose = await provider.complete(request, {
        timeoutMs,
        signal: options.signal,
      });
      const text = prose.text?.trim();
      return {
        section: this.sectionId,
        data:
          text && text.length > 0
            ? (this.normaliseText(text) as TOutput)
            : null,
        provider: prose.provider,
        model: prose.model,
        error: prose.error,
        raw: text ? null : prose.text,
        elapsedMs: prose.elapsedMs,
        usage: prose.usage,
        generatedAt: Date.now(),
      };
    }

    const result = await provider.completeJson<TOutput>(request, {
      schema,
      normalise: (value) => this.normalise(value),
      timeoutMs,
      signal: options.signal,
    });

    return {
      section: this.sectionId,
      data: result.data,
      provider: result.provider,
      model: result.model,
      error: result.error,
      raw: result.raw,
      elapsedMs: result.elapsedMs,
      usage: result.usage,
      generatedAt: Date.now(),
    };
  }
}

/**
 * What one section produced.
 *
 * `data` and `error` are mutually exclusive in practice: a section either
 * answered or it did not. `raw` is kept when parsing failed, because "the model
 * misbehaved" and "the model said something we could not read" are different
 * bugs and the difference is only visible in the text.
 */
export type AiSectionResult<T> = {
  section: AiSectionId;
  data: T | null;
  provider: AiProviderId;
  model: string | null;
  error: string | null;
  raw: string | null;
  elapsedMs: number;
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
  generatedAt: number;
};

/**
 * Convenience for sections whose answer carries its own provenance.
 *
 * Spreading this under the data is why a panel can label a verdict as coming
 * from "qwen3-8b on this machine" without the feature knowing where that string
 * came from.
 */
export function withProvenance<T>(
  result: AiSectionResult<T>,
): AiSectionResult<T> & { provenance: string | null } {
  return {
    ...result,
    provenance: result.model ? `${result.model} via ${result.provider}` : null,
  };
}
/**
 * A section that wants written prose rather than a validated object.
 *
 * Most sections extend `BaseAiSection` with a schema and get structured output.
 * This is the other half: a narrative brief, a summary a human reads, anything
 * where wrapping the answer in JSON would be pointless ceremony and would make
 * the model's job harder.
 *
 * It exists because "ask a model for something" has two genuinely different
 * shapes, and forcing both through one path tends to produce a base class with a
 * nullable schema and a type assertion at every call site. Splitting them here
 * keeps `run()`'s result shape identical either way, so a caller holding a
 * section never needs to know which kind it is.
 */
export abstract class TextAiSection<TContext> extends BaseAiSection<
  TContext,
  string
> {
  /** `null` is what switches {@link BaseAiSection.run} onto the prose path. */
  protected readonly schema = null;

  /** A completion with an empty or whitespace-only reply carries no summary. */
  protected override normaliseText(text: string): string {
    return text.trim();
  }
}
