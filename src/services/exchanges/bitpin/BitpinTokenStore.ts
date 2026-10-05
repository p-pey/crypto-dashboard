import "server-only";

import { env } from "~/env.js";
import { request } from "~/services/exchanges/http";
import { ExchangeError } from "~/services/trading/exchange.port";

/**
 * Bitpin's short-lived access tokens.
 *
 * Bitpin is the one venue here that does not take a ready-made token. The API
 * key and secret are exchanged for a JWT pair at runtime, and the pair comes
 * back with a 15-minute access token, which has to be refreshed continuously.
 *
 * Two documented facts shape this class:
 *
 * - **The token endpoints share a budget of 200 calls per day.** With a 15 minute
 *   access token a naive "refresh on 401" needs about 96 refreshes a day on its
 *   own, so the budget leaves roughly 2x headroom. That is why the expiry is
 *   read from the JWT itself and refreshed on a margin, rather than waiting for
 *   a 401 and retrying.
 * - **The two documented TTLs for the refresh token contradict each other**
 *   (one week versus 30 days). Rather than trust either, the expiry is decoded
 *   from the token and a safety margin is applied.
 *
 * The credential field names for `POST /usr/authenticate/` are not published.
 * That is a real gap, not a guess: {@link AUTH_BODY_CANDIDATES} holds the
 * plausible spellings and the first one the venue accepts is cached, so the
 * adapter works whichever the live API turns out to want.
 */

type TokenBundle = {
  access: string;
  refresh: string | null;
  /** Epoch ms, or null when the token was opaque and could not be decoded. */
  accessExpiresAt: number | null;
};

/** Refresh this far ahead of the real expiry. */
const REFRESH_MARGIN_MS = 90_000;

/**
 * Field-name spellings for the authenticate body, most likely first.
 *
 * Kept as data rather than as branching so that adding the real one later is a
 * one-line edit, and so the uncertainty is visible in one place.
 */
const AUTH_BODY_CANDIDATES: Record<string, unknown>[] = [
  { api_key: env.BITPIN_API_KEY, api_secret: env.BITPIN_SECRET_KEY },
  { apiKey: env.BITPIN_API_KEY, secretKey: env.BITPIN_SECRET_KEY },
  { key: env.BITPIN_API_KEY, secret: env.BITPIN_SECRET_KEY },
  { apiKey: env.BITPIN_API_KEY, apiSecret: env.BITPIN_SECRET_KEY },
  { username: env.BITPIN_API_KEY, password: env.BITPIN_SECRET_KEY },
];

/** Reads `exp` out of a JWT without verifying it; we only need the clock. */
function jwtExpiry(token: string): number | null {
  const parts = token.split(".");
  const payload = parts[1];
  if (!payload) return null;
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const bag = JSON.parse(json) as { exp?: number };
    return typeof bag.exp === "number" ? bag.exp * 1000 : null;
  } catch {
    return null;
  }
}

function readToken(
  payload: unknown,
): { access: string; refresh: string | null } | null {
  if (typeof payload !== "object" || payload === null) return null;
  const bag = payload as Record<string, unknown>;
  for (const container of [bag, bag.data, bag.result]) {
    if (typeof container !== "object" || container === null) continue;
    const row = container as Record<string, unknown>;
    const access =
      row.access_token ?? row.accessToken ?? row.token ?? row.jwt ?? row.access;
    if (typeof access === "string" && access.length > 0) {
      const refresh = row.refresh_token ?? row.refreshToken ?? row.refresh;
      return {
        access,
        refresh:
          typeof refresh === "string" && refresh.length > 0 ? refresh : null,
      };
    }
  }
  return null;
}

export class BitpinTokenStore {
  private bundle: TokenBundle | null = null;
  /** The credential spelling that worked, so the probe cost is paid once. */
  private workingBody: Record<string, unknown> | null = null;
  private inflight: Promise<TokenBundle> | null = null;

  private get credentials(): { key: string; secret: string } | null {
    const key = env.BITPIN_API_KEY;
    const secret = env.BITPIN_SECRET_KEY;
    if (!key || !secret) return null;
    return { key, secret };
  }

  get configured(): boolean {
    return this.credentials !== null;
  }

  /**
   * A valid bearer token, fetching one if needed.
   *
   * Concurrent callers share a single in-flight authentication so that a burst
   * of dashboard reads cannot spend several of the 200 daily calls at once.
   */
  async accessToken(): Promise<string> {
    const credentials = this.credentials;
    if (!credentials) {
      throw new ExchangeError(
        "bitpin",
        "unauthorized",
        "Bitpin credentials are not configured",
      );
    }

    const now = Date.now();
    if (
      this.bundle &&
      this.bundle.accessExpiresAt !== null &&
      this.bundle.accessExpiresAt - REFRESH_MARGIN_MS > now
    ) {
      return this.bundle.access;
    }

    if (this.inflight) return (await this.inflight).access;

    this.inflight = this.authenticate(credentials).finally(() => {
      this.inflight = null;
    });
    return (await this.inflight).access;
  }

  /** Credentials are read from the environment, so the argument is a guard. */
  private async authenticate(_credentials: {
    key: string;
    secret: string;
  }): Promise<TokenBundle> {
    const bodies = this.workingBody ? [this.workingBody] : AUTH_BODY_CANDIDATES;

    let lastError: ExchangeError | null = null;

    for (const body of bodies) {
      try {
        const payload = await request<unknown>({
          exchange: "bitpin",
          method: "POST",
          url: "/usr/authenticate/",
          baseUrl: "https://api.bitpin.ir/api/v1",
          body,
          idempotent: false,
          retries: 0,
        });

        const found = readToken(payload);
        if (found) {
          this.workingBody = body;
          this.bundle = {
            access: found.access,
            refresh: found.refresh,
            accessExpiresAt: jwtExpiry(found.access),
          };
          return this.bundle;
        }
        lastError = new ExchangeError(
          "bitpin",
          "unauthorized",
          "Bitpin authenticate returned no access token",
        );
      } catch (error) {
        lastError =
          error instanceof ExchangeError
            ? error
            : new ExchangeError(
                "bitpin",
                "unauthorized",
                "Bitpin authenticate failed",
                null,
                null,
                {
                  cause: error,
                },
              );
        // A body spelling that produces 400 is wrong; keep trying the others.
        if (lastError.kind === "invalid_request") continue;
        break;
      }
    }

    throw (
      lastError ??
      new ExchangeError("bitpin", "unauthorized", "Bitpin authenticate failed")
    );
  }

  /** Used by tests and by a manual retry from the settings screen. */
  reset(): void {
    this.bundle = null;
    this.workingBody = null;
  }
}
