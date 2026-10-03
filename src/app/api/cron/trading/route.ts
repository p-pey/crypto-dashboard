import { NextResponse } from "next/server";

import { env } from "~/env.js";
import { runTradingWorker } from "~/server/api/trading/trading.worker";

/**
 * The background worker.
 *
 * Runs the three jobs that must happen with no browser open: drain the
 * notification outbox, scan every venue for spreads that clear their costs, and
 * report what it managed to reach.
 *
 * Trigger it from an external scheduler:
 *
 *   * * * * * curl -sS -X POST http://localhost:3000/api/cron/trading \\
 *     -H 'x-cron-secret: $CRON_SECRET'
 *
 * A minute is frequent enough for a spread alert to feel timely and slow enough
 * to stay well inside the venues' rate limits, which the adapters enforce
 * themselves. In paper mode this is also what lets a resting paper order fill
 * while nobody is watching.
 */

export async function POST(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }

  // Constant-time compare, so the secret cannot be recovered by timing the
  // response. That matters more than usual here: it is a bearer credential.
  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!timingSafeEqual(provided, env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }

  try {
    const result = await runTradingWorker();
    return NextResponse.json({ mode: env.TRADING_MODE, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "worker failed",
      },
      { status: 500 },
    );
  }
}

export const GET = POST;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
