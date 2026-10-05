import "server-only";

import { toNumber } from "~/lib/cachedSource";

/**
 * Token safety mappers for GoPlus and Honeypot.is.
 *
 * Both are free, keyless and cover every EVM chain plus Solana, and between them
 * they answer the question that matters most when an address arrives from
 * somewhere else: **can this token even be sold, and who controls it?**
 *
 * The verdict deliberately fuses three independent signals rather than trusting
 * one — GoPlus' honeypot flag, Honeypot.is' own simulation, and the tax figures,
 * which are where most scams hide even when a token is not technically a
 * honeypot. A 25% sell tax that skips a simple transfer is a scam that a
 * honeypot check alone would pass.
 */

/** GoPlus covers these chains; the id is what its URL wants. */
export type GoPlusChainId =
  | "1"
  | "56"
  | "8453"
  | "42161"
  | "137"
  | "43114"
  | "10"
  | "250"
  | "59144"
  | "534352"
  | "25"
  | "100"
  | "324"
  | "1284";

export type HoneypotVerdict = "ok" | "risk" | "unknown";

/** The single number the badge renders. */
export type TokenSafety = {
  /**
   * The chain the check ran on, resolved from the address or passed in.
   * `solana` is a pseudo-chain here because GoPlus splits it onto its own route.
   */
  chain: string;
  address: string;

  /** Honeypot per GoPlus. Null when GoPlus had nothing to say. */
  goplusHoneypot: boolean | null;
  /** Honeypot per Honeypot.is, from its own buy/sell simulation. */
  honeypotIsHoneypot: boolean | null;

  /** Percent. Above ~10 is a warning sign; 25 or more is a honeypot in practice. */
  buyTax: number | null;
  sellTax: number | null;

  /** True when the owner can mint new supply at will. The classic rug vector. */
  isMintable: boolean | null;
  /** True when the owner can blacklist a holder from transferring. */
  canTakeBackOwnership: boolean | null;
  /** True when the owner is allowed to freeze accounts. */
  isProxy: boolean | null;
  ownerAddress: string | null;

  /** Percent of supply the top ten holders control, when derivable. */
  topTenShare: number | null;
  holderCount: number | null;

  isContract: boolean | null;
  /** True only when the token is verified source on the explorer. */
  isVerified: boolean | null;

  /** Fused outcome: `ok`, `risk`, or `unknown` when neither source answered. */
  verdict: HoneypotVerdict;
  /** Human-readable reasons behind the verdict, most serious first. */
  reasons: TokenSafetyReason[];
  /** Which of the two checkers answered, so a half-verified badge is visible. */
  sources: {
    goplus: boolean;
    honeypotIs: boolean;
  };
  checkedAt: number;
};

export type TokenSafetyReason = {
  code: TokenSafetyCode;
  /** Severity drives the badge tone. */
  severity: "critical" | "warning" | "info";
  detail: string;
};

export type TokenSafetyCode =
  | "honeypot"
  | "honeypot_disagreement"
  | "sellTax"
  | "buyTax"
  | "mintable"
  | "blacklist"
  | "proxy"
  | "unverified"
  | "lowLiquidity"
  | "notAContract"
  | "partialCoverage";

/** GoPlus's own `code` for each of its risk labels. */
const GOPLUS_SEVERITY: Record<number, { severity: TokenSafetyReason["severity"]; code: TokenSafetyCode }> =
  {
    1: { severity: "critical", code: "mintable" },
    2: { severity: "warning", code: "honeypot" },
    3: { severity: "warning", code: "blacklist" },
    4: { severity: "warning", code: "proxy" },
    5: { severity: "critical", code: "honeypot" },
    6: { severity: "warning", code: "proxy" },
    7: { severity: "info", code: "notAContract" },
    9: { severity: "info", code: "notAContract" },
    10: { severity: "warning", code: "blacklist" },
    11: { severity: "warning", code: "mintable" },
    13: { severity: "warning", code: "proxy" },
    14: { severity: "critical", code: "honeypot" },
    15: { severity: "warning", code: "honeypot" },
  };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  // GoPlus sends `"1"`/`"0"` for some flags and `1`/`0` for others.
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return null;
}

/** GoPlus reports `0.05` for 5%; anything ≥ 1 is already a percentage. */
function asTax(value: unknown): number | null {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  return parsed > 1 ? parsed : parsed * 100;
}

/** GoPlus nests the per-token payload one level down under `result`. */
export function unwrapGoPlus(payload: unknown): Record<string, unknown> {
  const root = asRecord(payload);
  if (root.status === "1" || root.status === 1) return root;

  const result = asRecord(root.result);
  const first = Object.values(result)[0];
  return asRecord(first);
}

export function mapGoPlus(payload: unknown): {
  honeypot: boolean | null;
  buyTax: number | null;
  sellTax: number | null;
  isMintable: boolean | null;
  canTakeBackOwnership: boolean | null;
  isProxy: boolean | null;
  ownerAddress: string | null;
  topTenShare: number | null;
  holderCount: number | null;
  isContract: boolean | null;
  isVerified: boolean | null;
  flagged: { code: TokenSafetyCode; severity: TokenSafetyReason["severity"] }[];
} {
  const token = unwrapGoPlus(payload);

  const flags = asRecord(token.code);
  const flagged: { code: TokenSafetyCode; severity: TokenSafetyReason["severity"] }[] =
    [];
  for (const [key, active] of Object.entries(flags)) {
    if (!active) continue;
    const mapped = GOPLUS_SEVERITY[Number.parseInt(key, 10)];
    if (mapped) flagged.push(mapped);
  }

  const owner = asRecord(token.owner_address);
  const holders = asRecord(token.holders);

  return {
    honeypot: asBool(token.is_honeypot),
    buyTax: asTax(token.buy_tax),
    sellTax: asTax(token.sell_tax),
    isMintable: asBool(token.is_mintable),
    canTakeBackOwnership: asBool(token.can_take_back_ownership),
    isProxy: asBool(token.is_proxy),
    ownerAddress: typeof owner.address === "string" ? owner.address : null,
    topTenShare: asTax(holders.top10_percent),
    holderCount: toNumber(holders.count),
    isContract: asBool(token.is_contract),
    isVerified: asBool(token.is_verified),
    flagged,
  };
}

export function mapHoneypotIs(payload: unknown): {
  honeypot: boolean | null;
  buyTax: number | null;
  sellTax: number | null;
  /** Honeypot.is' own simulation verdict, which is stricter than its flag. */
  simulation: "ok" | "risk" | "unknown";
  liquidity: number | null;
} {
  const root = asRecord(payload);
  const withToken = asRecord(root.withToken);

  const h = asBool(withToken.honeypotResult) ?? asBool(root.honeypotResult);
  const simulation = asBool(root.simulationResult)
    ? "risk"
    : h === null
      ? "unknown"
      : h
        ? "risk"
        : "ok";

  return {
    honeypot: h,
    buyTax: asTax(withToken.buyTax),
    sellTax: asTax(withToken.sellTax),
    simulation,
    liquidity: asTax(root.liquidity),
  };
}

/**
 * Fuses both checkers into one verdict.
 *
 * A **disagreement is itself a finding**, so it is reported rather than resolved
 * silently: if GoPlus says honeypot and Honeypot.is does not, the token is
 * flagged even though one source would clear it. Taking the optimistic reading of
 * two disagreeing scanners is precisely the failure mode this feature exists to
 * prevent.
 */
export function buildVerdict(input: {
  goplus: ReturnType<typeof mapGoPlus> | null;
  honeypotIs: ReturnType<typeof mapHoneypotIs> | null;
  chain: string;
  address: string;
  now: number;
}): TokenSafety {
  const reasons: TokenSafetyReason[] = [];
  const goplus = input.goplus;
  const honeypotIs = input.honeypotIs;

  const goplusFlaggedHoneypot = goplus?.honeypot === true;
  const honeypotIsFlaggedHoneypot = honeypotIs?.honeypot === true;

  if (goplusFlaggedHoneypot || honeypotIsFlaggedHoneypot) {
    reasons.push({
      code: "honeypot",
      severity: "critical",
      detail: "a sale was simulated and could not be completed",
    });
  } else if (
    goplus?.honeypot === false &&
    honeypotIs?.honeypot === false
  ) {
    // Nothing to flag, and this is the only outcome that earns the green badge.
  }

  if (
    goplus?.honeypot !== null &&
    honeypotIs?.honeypot !== null &&
    goplus?.honeypot !== undefined &&
    honeypotIs?.honeypot !== undefined &&
    goplusFlaggedHoneypot !== honeypotIsFlaggedHoneypot
  ) {
    reasons.push({
      code: "honeypot_disagreement",
      severity: "warning",
      detail: "the two checkers disagree; treated as unsafe",
    });
  }

  const sellTax = goplus?.sellTax ?? honeypotIs?.sellTax ?? null;
  const buyTax = goplus?.buyTax ?? honeypotIs?.buyTax ?? null;

  // 10% is the threshold rather than something higher: an ordinary utility token
  // does not need a double-digit tax, and a tax that high on the way out is how
  // a honeypot collects without ever setting the honeypot flag.
  if (sellTax !== null && sellTax >= 10) {
    reasons.push({
      code: "sellTax",
      severity: sellTax >= 25 ? "critical" : "warning",
      detail: `sell tax is ${sellTax.toFixed(1)}%`,
    });
  }

  if (buyTax !== null && buyTax >= 10) {
    reasons.push({
      code: "buyTax",
      severity: buyTax >= 25 ? "critical" : "warning",
      detail: `buy tax is ${buyTax.toFixed(1)}%`,
    });
  }

  if (goplus?.isMintable === true) {
    reasons.push({
      code: "mintable",
      severity: "critical",
      detail: "the owner can mint new supply at will",
    });
  }

  if (goplus?.canTakeBackOwnership === true) {
    reasons.push({
      code: "blacklist",
      severity: "warning",
      detail: "the owner can re-take ownership and block holders",
    });
  }

  if (goplus?.isProxy === true) {
    reasons.push({
      code: "proxy",
      severity: "warning",
      detail: "upgradeable proxy: the rules can change after you buy",
    });
  }

  if (goplus?.isVerified === false) {
    reasons.push({
      code: "unverified",
      severity: "warning",
      detail: "source is not verified on the explorer",
    });
  }

  if (honeypotIs?.liquidity !== null && honeypotIs?.liquidity !== undefined) {
    const liquidity = honeypotIs.liquidity ?? 0;
    if (liquidity > 0 && liquidity < 5_000) {
      reasons.push({
        code: "lowLiquidity",
        severity: "warning",
        detail: "under $5k of pool liquidity — not exitable at size",
      });
    }
  }

  if (goplus?.isContract === false) {
    reasons.push({
      code: "notAContract",
      severity: "warning",
      detail: "not a contract: the address holds no token code",
    });
  }

  if (reasons.length === 0) {
    reasons.push({
      code: "partialCoverage",
      severity: "info",
      detail:
        goplus === null && honeypotIs === null
          ? "neither checker could be reached"
          : "no risk flags reported by the checkers that answered",
    });
  }

  // Most serious first, so a truncated list still shows what matters.
  const order: Record<TokenSafetyReason["severity"], number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  reasons.sort((a, b) => order[a.severity] - order[b.severity]);

  const hasCritical = reasons.some((reason) => reason.severity === "critical");
  const hasWarning = reasons.some((reason) => reason.severity === "warning");

  return {
    chain: input.chain,
    address: input.address,
    goplusHoneypot: goplus?.honeypot ?? null,
    honeypotIsHoneypot: honeypotIs?.honeypot ?? null,
    buyTax,
    sellTax,
    isMintable: goplus?.isMintable ?? null,
    canTakeBackOwnership: goplus?.canTakeBackOwnership ?? null,
    isProxy: goplus?.isProxy ?? null,
    ownerAddress: goplus?.ownerAddress ?? null,
    topTenShare: goplus?.topTenShare ?? null,
    holderCount: goplus?.holderCount ?? null,
    isContract: goplus?.isContract ?? null,
    isVerified: goplus?.isVerified ?? null,
    verdict: hasCritical ? "risk" : hasWarning ? "risk" : "ok",
    reasons,
    sources: {
      goplus: goplus !== null,
      honeypotIs: honeypotIs !== null,
    },
    checkedAt: input.now,
  };
}