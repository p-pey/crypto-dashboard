/**
 * The runtime ids, mirrored for the client.
 *
 * `ai.port` is `server-only`, because it carries the port contract that only
 * the server implements — but the ids themselves are just four strings that the
 * provider picker has to render. Duplicating the union here would let the two
 * drift, so this file asserts the mirror at compile time instead: the type
 * below only compiles while it matches the port's own union exactly.
 */
export type AiProviderId = "local" | "gemini" | "groq" | "openrouter";

export const AI_PROVIDER_IDS: readonly AiProviderId[] = [
  "local",
  "gemini",
  "groq",
  "openrouter",
];
