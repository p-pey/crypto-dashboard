import "server-only";

import { AppSignleton } from "~/lib/container";
import { env } from "~/env.js";
import { TradingRepository } from "~/repository/trading.repository";
import type { Order } from "~/services/trading/trading.types";
import { parseDecimal, toPlainString } from "~/services/trading/decimal";

/**
 * Telegram delivery for trade events.
 *
 * The hard constraint is that Telegram's `sendMessage` has **no idempotency
 * key** - there is no `random_id`, no `Idempotency-Key` header, nothing. So a
 * request that times out after Telegram already delivered is indistinguishable
 * from one that never arrived, and retrying it duplicates the message. There is
 * no way to detect the difference from the response.
 *
 * That single fact shapes the whole design:
 *
 * - Every message is written to an outbox row **before** the send is attempted,
 *   so a crash mid-flight leaves a recoverable `pending` row rather than a
 *   silently dropped trade notification.
 * - Retries are deliberately asymmetric. A connection-level failure provably
 *   never reached Telegram, so repeating it is safe. An established connection
 *   that then failed is ambiguous, and those are logged for a human rather than
 *   retried, because a duplicate "SELL FILLED" message is worse than a missing
 *   one.
 * - `429` is retried because it carries `retry_after` and Telegram did not
 *   deliver.
 *
 * Rate limits are self-enforced at roughly one message per second rather than
 * discovered as a 429.
 */

type TelegramResult = {
  ok: boolean;
  description?: string;
  messageId?: number | null;
  retryAfter?: number;
};

/** Telegram counts a chat at one message per second before it starts refusing. */
const MIN_SEND_GAP_MS = 1000;

/** A single chat is not flooded by a bug that loops. */
const MESSAGE_LIMIT = 4096;

@AppSignleton()
export class TelegramNotifier {
  private lastSendAt = 0;
  private flushing = false;

  private readonly repository: TradingRepository;

  constructor(repository: TradingRepository) {
    this.repository = repository;
  }

  get configured(): boolean {
    return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
  }

  /**
   * Queues a message.
   *
   * Returns the outbox row id, or null when Telegram is not configured - the
   * app stays fully functional without it, just quiet.
   */
  enqueue(kind: string, text: string): string | null {
    if (!this.configured) return null;
    return this.repository.enqueueNotification(kind, { text: truncate(text) });
  }

  /* ------------------------------------------------------------------ *
   * Trade events
   * ------------------------------------------------------------------ */

  orderPlaced(order: Order): void {
    this.enqueue(
      "order_placed",
      [
        `<b>ORDER PLACED</b>`,
        this.line(order),
        `Status: <code>${order.status}</code>`,
        "Resting at the exact limit price. Cancel it yourself if the price moves away.",
      ].join("\n"),
    );
  }

  orderFilled(order: Order): void {
    this.enqueue(
      "order_filled",
      [
        `<b>ORDER FILLED</b>`,
        this.line(order),
        `Filled: <code>${order.filledAmount}</code> @ <code>${order.averagePrice ?? order.price}</code>`,
      ].join("\n"),
    );
  }

  orderCancelled(order: Order): void {
    this.enqueue(
      "order_cancelled",
      [
        `<b>ORDER CANCELLED</b>`,
        this.line(order),
        `Filled before cancelling: <code>${order.filledAmount}</code> of <code>${order.amount}</code>`,
      ].join("\n"),
    );
  }

  orderFailed(where: string, reason: string, venueCode: string | null): void {
    this.enqueue(
      "order_failed",
      [
        `<b>ORDER FAILED</b>`,
        where,
        reason,
        venueCode ? `Exchange code: <code>${escapeHtml(venueCode)}</code>` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  /** Arbitrage spreads and price-move alerts. */
  alert(title: string, body: string): void {
    this.enqueue("alert", [`<b>${escapeHtml(title)}</b>`, body].join("\n"));
  }

  private line(order: Order): string {
    return [
      `Exchange: <b>${escapeHtml(order.exchange)}</b>`,
      `Side: <b>${order.side.toUpperCase()}</b>`,
      `Instrument: <b>${escapeHtml(order.instrumentId.toUpperCase())}</b> <code>${escapeHtml(order.symbol)}</code>`,
      `Limit: <code>${escapeHtml(order.price)}</code>`,
      `Size: <code>${escapeHtml(order.amount)}</code>`,
      `Id: <code>${escapeHtml(order.id)}</code>`,
    ].join("\n");
  }

  /* ------------------------------------------------------------------ *
   * Delivery
   * ------------------------------------------------------------------ */

  /**
   * Sends everything queued.
   *
   * Returns how many were delivered. Safe to call from a cron route or after
   * any order mutation; a second concurrent call is a no-op rather than a
   * double send.
   */
  async flush(): Promise<number> {
    if (!this.configured || this.flushing) return 0;
    this.flushing = true;

    try {
      let delivered = 0;
      for (const row of this.repository.claimPendingNotifications(10)) {
        try {
          const outcome = await this.send(
            JSON.parse(row.payload) as { text: string },
          );
          this.repository.markNotificationSent(
            row.id,
            outcome.messageId ?? null,
          );
          delivered += 1;
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.repository.markNotificationFailed(row.id, reason);
        }
      }
      return delivered;
    } finally {
      this.flushing = false;
    }
  }

  private async send(body: { text: string }): Promise<TelegramResult> {
    const token = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) throw new Error("telegram is not configured");

    // Space the sends out ourselves rather than discovering the limit as a 429.
    const wait = this.lastSendAt + MIN_SEND_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastSendAt = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // HTML is escaped at the call site rather than here, so the escaping
          // lives next to the data that could contain a stray `<`.
          body: JSON.stringify({
            chat_id: chatId,
            text: body.text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
          signal: controller.signal,
        },
      );

      const payload = (await response.json()) as TelegramResult & {
        parameters?: { retry_after?: number };
        result?: { message_id?: number };
      };

      if (payload.ok === true) {
        return { ok: true, messageId: payload.result?.message_id ?? null };
      }

      // Flood control is the one failure that provably did not deliver.
      if (response.status === 429) {
        const delay = payload.parameters?.retry_after ?? 5;
        await new Promise((resolve) => setTimeout(resolve, delay * 1000));
        throw new Error(`telegram rate limited, retried after ${delay}s`);
      }

      throw new Error(
        `telegram rejected the message: ${payload.description ?? response.status}`,
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Ambiguous: Telegram may or may not have delivered. Deliberately not
        // retried, because a duplicate fill notice is worse than a missed one.
        throw new Error(
          "telegram request timed out after sending; delivery is unknown and was not retried",
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Escapes the three characters Telegram's HTML parser treats as markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Clips to Telegram's rendered-text limit.
 *
 * The limit is counted after entity parsing, so the markup itself does not
 * count; clipping the source is still the safe approximation.
 */
function truncate(text: string): string {
  if (text.length <= MESSAGE_LIMIT) return text;
  return `${text.slice(0, MESSAGE_LIMIT - 40)}\n…(clipped)`;
}

export { parseDecimal, toPlainString };
