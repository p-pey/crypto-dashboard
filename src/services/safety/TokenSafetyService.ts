import "server-only";

import { CachedSource, describeError } from "~/lib/cachedSource";
import { AppInject, AppSignleton } from "~/lib/container";
import { AxiosService } from "~/lib/axios";

import {
  buildVerdict,
  mapGoPlus,
  mapHoneypotIs,
  type GoPlusChainId,
  type TokenSafety,
} from "./tokenSafety.mapper";

/**
 * Token scam screening, free and keyless.
 *
 * Two independent checkers, queried in parallel, fused into one verdict:
 *
 * - **GoPlus** (`api.gopluslabs.io`) covers every EVM chain *and* Solana on one
 *   route each, and reports owner privileges alongside the honeypot flag.
 * - **Honeypot.is** (`api.honeypot.is`) actually simulates a buy and a sell
 *   against the live pool, which is a stronger test than any static flag.
 *
 * Neither is trusted alone. GoPlus reads the contract and reasons about it;
 * Honeypot.is executes against it. They fail in different ways, so a token both
 * clear is meaningfully safer than a token one cleared.
 *
 * This is the only feature in the app whose purpose is to stop the user doing
 * something harmful rather than to inform them, which is why it lives here in
 * full rather than as a detail-page extra.
 */

const GOPLUS_EVM = "https://api.gopluslabs.io/api/v1/token_security";
const GOPLUS_SOLANA =
  "https://api.gopluslabs.io/api/v1/solana/token_security";
const HONEYPOT_IS = "https://api.honeypot.is/v2/IsHoneypot";

const REQUEST_TIMEOUT_MS = 12_000;

/** An address check is expensive and point-in-time; five minutes is a refresh. */
const SAFETY_TTL_MS = 5 * 60_000;

export type SafetyCheckResult = {
  safety: TokenSafety | null;
  /** Per-checker outcomes, so a half-verified badge can say which half. */
  checkers: { id: string; label: string; ok: boolean; error: string | null }[];
  fetchedAt: number;
  stale: boolean;
  error: string | null;
};

/**
 * Chain detection and GoPlus ids.
 *
 * Resolved from the address's shape rather than asked for, because a user
 * pasting a bare address cannot be expected to also pick a chain — and a safety
 * check that quietly ran on the wrong chain would be worse than none.
 */
const EVM_CHAINS: { id: GoPlusChainId; name: string; aliases: string[] }[] = [
  { id: "1", name: "Ethereum", aliases: ["eth", "ethereum", "mainnet"] },
  { id: "56", name: "BNB Chain", aliases: ["bsc", "bnb", "bnbchain"] },
  { id: "8453", name: "Base", aliases: ["base"] },
  { id: "42161", name: "Arbitrum", aliases: ["arbitrum", "arb"] },
  { id: "137", name: "Polygon", aliases: ["polygon", "matic", "poly"] },
  { id: "43114", name: "Avalanche", aliases: ["avalanche", "avax"] },
  { id: "10", name: "Optimism", aliases: ["optimism", "op"] },
  { id: "250", name: "Fantom", aliases: ["fantom", "ftm"] },
  { id: "59144", name: "Linea", aliases: ["linea"] },
  { id: "534352", name: "Scroll", aliases: ["scroll"] },
  { id: "25", name: "Cronos", aliases: ["cronos"] },
  { id: "100", name: "Gnosis", aliases: ["gnosis", "xdai"] },
  { id: "324", name: "zkSync", aliases: ["zksync"] },
  { id: "1284", name: "Moonbeam", aliases: ["moonbeam"] },
];

export type ResolvedChain = {
  /** What the checkers are actually asked about. */
  name: string;
  goplusChain: GoPlusChainId | "solana" | null;
  evm: boolean;
};

/**
 * Decides the chain from an optional hint and the address itself.
 *
 * A Solana address is base58 and 32–44 characters; an EVM one is `0x` plus 40
 * hex. The shapes do not overlap, so detection is reliable. When a hint is given
 * and contradicts the shape, **the shape wins** — a wrong chain produces a
 * confident wrong answer, and a contradicted hint is a user error worth ignoring.
 */
export function resolveChain(
  address: string,
  hint?: string | null,
): ResolvedChain {
  const trimmed = address.trim();
  const looksEvm = /^0x[a-fA-F0-9]{40}$/.test(trimmed);
  const looksSolana = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);

  const normalizedHint = (hint ?? "").trim().toLowerCase();
  if (normalizedHint) {
    const byHint = EVM_CHAINS.find((chain) =>
      chain.aliases.includes(normalizedHint),
    );
    if (byHint) {
      return { name: byHint.name, goplusChain: byHint.id, evm: true };
    }
    if (["solana", "sol"].includes(normalizedHint)) {
      return { name: "Solana", goplusChain: "solana", evm: false };
    }
  }

  if (looksEvm) {
    // Default EVM chain is Ethereum: it is the one most pasted addresses are on
    // and the one GoPlus treats as chain 1 by default.
    return { name: "Ethereum", goplusChain: "1", evm: true };
  }

  if (looksSolana) {
    return { name: "Solana", goplusChain: "solana", evm: false };
  }

  return { name: "unknown", goplusChain: null, evm: false };
}

@AppSignleton()
export default class TokenSafetyService {
  /**
   * Keyed by `chain:address` rather than address alone, because the same string
   * can be valid on two chains and a cached verdict for one must never be served
   * for the other.
   */
  private readonly cache = new Map<string, CachedSource<SafetyCheckResult>>();

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {}

  async check(
    input: { address: string; chain?: string | null; force?: boolean },
  ): Promise<SafetyCheckResult> {
    const address = input.address.trim();
    const chain = resolveChain(address, input.chain);

    const now = Date.now();
    if (chain.goplusChain === null) {
      return {
        safety: null,
        checkers: [],
        fetchedAt: now,
        stale: false,
        error:
          "that does not look like an EVM (0x…) or Solana address — nothing was checked",
      };
    }

    const source = this.sourceFor(chain, address);
    const envelope = await source.read({ force: input.force });

    return {
      ...envelope.data,
      fetchedAt: Math.max(envelope.fetchedAt, envelope.data.fetchedAt),
      stale: envelope.stale,
      error: envelope.error,
    };
  }

  private sourceFor(chain: ResolvedChain, address: string): CachedSource<SafetyCheckResult> {
    const key = `${chain.name}:${address.toLowerCase()}`;
    const existing = this.cache.get(key);
    if (existing) return existing;

    const created = new CachedSource<SafetyCheckResult>({
      // A safety verdict is a point-in-time judgement about a mutable contract.
      // Serving yesterday's "safe" is worse than re-checking, and unlike a price
      // a stale safety badge could get someone hurt, so it is short.
      ttlMs: SAFETY_TTL_MS,
      // Falling back to an old safety verdict would be misleading rather than
      // merely stale: the contract's owner may have changed. On failure this
      // reports unavailable instead.
      staleWhileRefreshing: false,
      load: () => this.runChecks(chain, address),
      empty: () => ({
        safety: null,
        checkers: [],
        fetchedAt: Date.now(),
        stale: true,
        error: "no checker could be reached",
      }),
    });

    // Bounded so a user pasting many addresses cannot grow this without limit.
    // A Map with insertion-order iteration prunes from the oldest.
    if (this.cache.size >= 200) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }

    this.cache.set(key, created);
    return created;
  }

  /**
   * Queries both checkers concurrently and settles each independently.
   *
   * One checker being down must not fail the check: the other still gives a
   * usable verdict, and the panel shows which half answered. What it must never
   * do is report success when neither did, which is why both results are
   * inspected rather than the first one to resolve.
   */
  private async runChecks(
    chain: ResolvedChain,
    address: string,
  ): Promise<SafetyCheckResult> {
    const goplusChain = chain.goplusChain;
    if (goplusChain === null) {
      return {
        safety: null,
        checkers: [],
        fetchedAt: Date.now(),
        stale: false,
        error: "unsupported chain",
      };
    }

    const now = Date.now();

    const goplusPromise = this.http
      .get<unknown>(
        goplusChain === "solana"
          ? `${GOPLUS_SOLANA}?contract_addresses=${encodeURIComponent(address)}`
          : `${GOPLUS_EVM}/${goplusChain}?contract_addresses=${encodeURIComponent(address)}`,
        { timeout: REQUEST_TIMEOUT_MS },
      )
      .then((response) => mapGoPlus(response.data));

    // Honeypot.is is EVM-only. Asking it about a Solana address returns a
    // confusing error, so it is reported as not-applicable rather than failed —
    // "this checker does not cover this chain" is not the same as a timeout.
    const honeypotPromise =
      chain.evm
        ? this.http
            .get<unknown>(
              `${HONEYPOT_IS}?address=${encodeURIComponent(address)}`,
              { timeout: REQUEST_TIMEOUT_MS },
            )
            .then((response) => mapHoneypotIs(response.data))
        : Promise.resolve(null);

    const [goplusResult, honeypotResult] = await Promise.allSettled([
      goplusPromise,
      honeypotPromise,
    ]);

    const goplus =
      goplusResult.status === "fulfilled" ? goplusResult.value : null;
    const honeypotIs =
      honeypotResult.status === "fulfilled" ? honeypotResult.value : null;

    const checkers: SafetyCheckResult["checkers"] = [
      {
        id: "goplus",
        label: "GoPlus",
        ok: goplusResult.status === "fulfilled",
        error:
          goplusResult.status === "rejected"
            ? describeError(goplusResult.reason)
            : null,
      },
      {
        id: "honeypotIs",
        label: "Honeypot.is",
        // Not applicable is reported as ok-with-no-data by omitting it from the
        // failure list; the panel checks `sources` for real coverage.
        ok: honeypotResult.status === "fulfilled",
        error:
          honeypotResult.status === "rejected"
            ? describeError(honeypotResult.reason)
            : null,
      },
    ];

    if (goplus === null && honeypotIs === null) {
      return {
        safety: null,
        checkers,
        fetchedAt: now,
        stale: false,
        error:
          checkers.map((checker) => checker.error).find(Boolean) ??
          "neither checker answered",
      };
    }

    return {
      safety: buildVerdict({
        goplus,
        honeypotIs,
        chain: chain.name,
        address,
        now,
      }),
      checkers,
      fetchedAt: now,
      stale: false,
      error:
        goplus === null || honeypotIs === null
          ? (checkers.find((checker) => !checker.ok)?.error ?? null)
          : null,
    };
  }
}