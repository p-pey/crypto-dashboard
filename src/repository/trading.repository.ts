import "server-only";

import { randomUUID } from "node:crypto";

import { AppSignleton } from "~/lib/container";
import {
  multiply,
  parseDecimal,
  toPlainString,
} from "~/services/trading/decimal";
import type {
  Balance,
  ExchangeId,
  Order,
  OrderSide,
  OrderStatus,
} from "~/services/trading/trading.types";
import { tradingDb, transact } from "./trading.db";

/**
 * Everything this app stores locally.
 *
 * Deliberately narrow. Live orders and fills are read from the exchange on
 * demand, so nothing here is a cache that could drift out of step with the
 * venue and quietly misreport what is actually at risk.
 */

export type ArbitrageRule = {
  id: string;
  instrumentId: string;
  buyExchange: ExchangeId;
  sellExchange: ExchangeId;
  /** Minimum spread, as a percentage of the cheap side, before alerting. */
  thresholdPercent: string;
  enabled: boolean;
  lastFiredAt: number | null;
  createdAt: number;
};

export type PositionProtection = {
  id: string;
  exchange: ExchangeId;
  positionId: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: string;
  takeProfit: string | null;
  stopLoss: string | null;
  createdAt: number;
  note: string | null;
};

export type NotificationRow = {
  id: string;
  kind: string;
  payload: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  createdAt: number;
};

type PaperOrderRow = {
  id: string;
  client_order_id: string;
  exchange: string;
  instrument_id: string;
  symbol: string;
  side: string;
  price: string;
  amount: string;
  filled_amount: string;
  average_price: string | null;
  fee: string | null;
  fee_asset: string | null;
  status: string;
  note: string | null;
  created_at: number;
  updated_at: number;
};

@AppSignleton()
export class TradingRepository {
  /* ------------------------------------------------------------------ *
   * Paper ledger
   * ------------------------------------------------------------------ */

  /**
   * Starting holdings for a simulated account.
   *
   * Seeded on first use rather than configured, because a paper account with a
   * made-up starting balance teaches the wrong lesson. The operator sets a
   * figure here to match roughly what the real account holds.
   */
  seedPaperBalance(exchange: ExchangeId, asset: string, amount: string): void {
    const db = tradingDb();
    db.prepare(
      `INSERT OR IGNORE INTO paper_accounts (exchange, asset, free, locked)
       VALUES (?, ?, ?, '0')`,
    ).run(exchange, asset, amount);
  }

  getPaperBalances(exchange: ExchangeId): Balance[] {
    const rows = tradingDb()
      .prepare(
        `SELECT asset, free, locked FROM paper_accounts WHERE exchange = ? ORDER BY asset`,
      )
      .all(exchange) as { asset: string; free: string; locked: string }[];

    return rows.map((row) => ({
      exchange,
      asset: row.asset,
      free: row.free,
      locked: row.locked,
      total: addStrings(row.free, row.locked),
      valueInRial: null,
    }));
  }

  /**
   * Moves value in and out of a simulated holding.
   *
   * Delta-based rather than set-based so that an over-spend cannot silently
   * create a negative balance: the caller checks, and this records the change.
   */
  private adjustPaperBalance(
    exchange: ExchangeId,
    asset: string,
    delta: string,
  ): void {
    const db = tradingDb();
    const row = db
      .prepare(
        `SELECT free, locked FROM paper_accounts WHERE exchange = ? AND asset = ?`,
      )
      .get(exchange, asset) as { free: string; locked: string } | undefined;

    const free = row?.free ?? "0";
    const locked = row?.locked ?? "0";
    const nextFree = addStrings(free, delta);

    if (parseDecimal(nextFree).mantissa < 0n) {
      throw new Error(
        `paper account would go negative on ${asset} at ${exchange}`,
      );
    }

    db.prepare(
      `INSERT INTO paper_accounts (exchange, asset, free, locked)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(exchange, asset) DO UPDATE SET free = excluded.free`,
    ).run(exchange, asset, nextFree, locked);
  }

  lockPaperBalance(
    exchange: ExchangeId,
    asset: string,
    from: "free" | "locked",
    delta: string,
  ): void {
    const db = tradingDb();
    const row = db
      .prepare(
        `SELECT free, locked FROM paper_accounts WHERE exchange = ? AND asset = ?`,
      )
      .get(exchange, asset) as { free: string; locked: string } | undefined;

    const free = addStrings(
      row?.free ?? "0",
      from === "free" ? negate(delta) : delta,
    );
    const locked = addStrings(
      row?.locked ?? "0",
      from === "locked" ? negate(delta) : delta,
    );

    if (
      parseDecimal(free).mantissa < 0n ||
      parseDecimal(locked).mantissa < 0n
    ) {
      throw new Error(`insufficient paper balance for ${asset} at ${exchange}`);
    }

    db.prepare(
      `INSERT INTO paper_accounts (exchange, asset, free, locked)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(exchange, asset) DO UPDATE
         SET free = excluded.free, locked = excluded.locked`,
    ).run(exchange, asset, free, locked);
  }

  insertPaperOrder(order: Order): void {
    tradingDb()
      .prepare(
        `INSERT INTO paper_orders
           (id, client_order_id, exchange, instrument_id, symbol, side, price,
            amount, filled_amount, average_price, fee, fee_asset, status, note,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        order.id,
        order.clientOrderId ?? randomUUID(),
        order.exchange,
        order.instrumentId,
        order.symbol,
        order.side,
        order.price,
        order.amount,
        order.filledAmount,
        order.averagePrice,
        order.fee,
        order.feeAsset,
        order.status,
        order.note,
        order.createdAt,
        order.updatedAt,
      );
  }

  updatePaperOrder(order: Order): void {
    tradingDb()
      .prepare(
        `UPDATE paper_orders SET status = ?, filled_amount = ?, average_price = ?,
           fee = ?, note = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        order.status,
        order.filledAmount,
        order.averagePrice,
        order.fee,
        order.note,
        order.updatedAt,
        order.id,
      );
  }

  getPaperOrder(id: string): Order | null {
    const row = tradingDb()
      .prepare(`SELECT * FROM paper_orders WHERE id = ?`)
      .get(id) as PaperOrderRow | undefined;
    return row ? toPaperOrder(row) : null;
  }

  getPaperOrderByClientId(clientOrderId: string): Order | null {
    const row = tradingDb()
      .prepare(`SELECT * FROM paper_orders WHERE client_order_id = ?`)
      .get(clientOrderId) as PaperOrderRow | undefined;
    return row ? toPaperOrder(row) : null;
  }

  listPaperOrders(exchange: ExchangeId, openOnly = false): Order[] {
    const sql = openOnly
      ? `SELECT * FROM paper_orders WHERE exchange = ? AND status IN ('open','partially_filled') ORDER BY created_at DESC`
      : `SELECT * FROM paper_orders WHERE exchange = ? ORDER BY created_at DESC LIMIT 200`;
    const rows = tradingDb().prepare(sql).all(exchange) as PaperOrderRow[];
    return rows.map(toPaperOrder);
  }

  recordPaperTrade(
    orderId: string,
    side: OrderSide,
    price: string,
    amount: string,
  ): void {
    tradingDb()
      .prepare(
        `INSERT INTO paper_trades
           (id, order_id, exchange, instrument_id, symbol, side, price, amount,
            value, fee, fee_asset, traded_at)
         VALUES (?, ?, '', '', '', ?, ?, ?, ?, NULL, NULL, ?)`,
      )
      .run(
        randomUUID(),
        orderId,
        side,
        price,
        amount,
        toPlainString(multiply(parseDecimal(price), parseDecimal(amount))),
        Date.now(),
      );
  }

  /**
   * Debits a simulated account after a simulated fill.
   *
   * The assets are passed in rather than parsed from the symbol, because the
   * four venues spell symbols four different ways and only the catalogue knows
   * which side is the base.
   */
  settlePaperFill(
    order: Order,
    assets: { base: string; quote: string },
    filledValue: string,
  ): void {
    transact(() => {
      if (order.side === "buy") {
        // Spend quote, receive base.
        this.adjustPaperBalance(
          order.exchange,
          assets.quote,
          negate(filledValue),
        );
        this.adjustPaperBalance(
          order.exchange,
          assets.base,
          order.filledAmount,
        );
      } else {
        // Give up base, receive quote.
        this.adjustPaperBalance(
          order.exchange,
          assets.base,
          negate(order.filledAmount),
        );
        this.adjustPaperBalance(order.exchange, assets.quote, filledValue);
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Order id map
   * ------------------------------------------------------------------ */

  rememberOrderId(
    clientOrderId: string,
    exchange: ExchangeId,
    venueOrderId: string,
    symbol: string,
  ): void {
    tradingDb()
      .prepare(
        `INSERT INTO order_id_map
           (client_order_id, exchange, venue_order_id, symbol, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(client_order_id) DO UPDATE SET venue_order_id = excluded.venue_order_id`,
      )
      .run(clientOrderId, exchange, venueOrderId, symbol, Date.now());
  }

  /* ------------------------------------------------------------------ *
   * Notification outbox
   * ------------------------------------------------------------------ */

  /** Written before the send is attempted, so a crash cannot lose the message. */
  enqueueNotification(kind: string, payload: unknown): string {
    const id = randomUUID();
    tradingDb()
      .prepare(
        `INSERT INTO notifications (id, kind, payload, status, attempts, created_at)
         VALUES (?, ?, ?, 'pending', 0, ?)`,
      )
      .run(id, kind, JSON.stringify(payload), Date.now());
    return id;
  }

  claimPendingNotifications(limit = 20): NotificationRow[] {
    return (
      tradingDb()
        .prepare(
          `SELECT id, kind, payload, status, attempts, created_at
             FROM notifications WHERE status = 'pending'
            ORDER BY created_at LIMIT ?`,
        )
        .all(limit) as {
        id: string;
        kind: string;
        payload: string;
        status: "pending" | "sent" | "failed";
        attempts: number;
        created_at: number;
      }[]
    ).map((row) => ({
      id: row.id,
      kind: row.kind,
      payload: row.payload,
      status: row.status,
      attempts: row.attempts,
      createdAt: row.created_at,
    }));
  }

  markNotificationSent(id: string, telegramId: number | null): void {
    tradingDb()
      .prepare(
        `UPDATE notifications SET status = 'sent', sent_at = ?, telegram_id = ?,
           attempts = attempts + 1 WHERE id = ?`,
      )
      .run(Date.now(), telegramId, id);
  }

  markNotificationFailed(id: string, reason: string): void {
    tradingDb()
      .prepare(
        `UPDATE notifications SET attempts = attempts + 1, last_error = ?,
           status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END
         WHERE id = ?`,
      )
      .run(reason, id);
  }

  /* ------------------------------------------------------------------ *
   * Emulated position protection
   * ------------------------------------------------------------------ */

  /** A protective level this app is holding on the operator's behalf. */
  listArmedProtection(): PositionProtection[] {
    const rows = tradingDb()
      .prepare(
        `SELECT * FROM position_protection WHERE status = 'armed' ORDER BY created_at`,
      )
      .all() as {
      id: string;
      exchange: string;
      position_id: string;
      symbol: string;
      side: string;
      entry_price: string;
      take_profit: string | null;
      stop_loss: string | null;
      status: string;
      note: string | null;
      created_at: number;
    }[];

    return rows.map((row) => ({
      id: row.id,
      exchange: row.exchange as ExchangeId,
      positionId: row.position_id,
      symbol: row.symbol,
      side: row.side as "long" | "short",
      entryPrice: row.entry_price,
      takeProfit: row.take_profit,
      stopLoss: row.stop_loss,
      createdAt: row.created_at,
      note: row.note,
    }));
  }

  /**
   * Stores or replaces the levels for one position.
   *
   * A single row per position, so setting a stop twice replaces it rather than
   * leaving an older, wrong level armed alongside the new one.
   */
  saveProtection(row: {
    exchange: ExchangeId;
    positionId: string;
    symbol: string;
    side: "long" | "short";
    entryPrice: string;
    takeProfit: string | null;
    stopLoss: string | null;
    note: string | null;
  }): string {
    const id = randomUUID();
    tradingDb()
      .prepare(
        `INSERT INTO position_protection
           (id, exchange, position_id, symbol, side, entry_price, take_profit,
            stop_loss, status, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'armed', ?, ?)
         ON CONFLICT(exchange, position_id) DO UPDATE SET
           take_profit = excluded.take_profit,
           stop_loss = excluded.stop_loss,
           entry_price = excluded.entry_price,
           symbol = excluded.symbol,
           side = excluded.side,
           note = excluded.note,
           status = 'armed',
           triggered_at = NULL`,
      )
      .run(
        id,
        row.exchange,
        row.positionId,
        row.symbol,
        row.side,
        row.entryPrice,
        row.takeProfit,
        row.stopLoss,
        row.note,
        Date.now(),
      );
    return id;
  }

  /** Disarms a level without deleting the row, so the history survives. */
  clearProtection(exchange: ExchangeId, positionId: string): void {
    tradingDb()
      .prepare(
        `UPDATE position_protection
            SET status = 'cleared', take_profit = NULL, stop_loss = NULL,
                triggered_at = ?
          WHERE exchange = ? AND position_id = ?`,
      )
      .run(Date.now(), exchange, positionId);
  }

  /**
   * Marks a level as fired.
   *
   * Guarded on `status = 'armed'` so that a stop which is already filling cannot
   * be fired a second time by the next poll - the window between the order being
   * sent and the position actually closing is longer than one poll.
   */
  claimProtection(id: string): boolean {
    const result = tradingDb()
      .prepare(
        `UPDATE position_protection
            SET status = 'triggered', triggered_at = ?
          WHERE id = ? AND status = 'armed'`,
      )
      .run(Date.now(), id);
    return result.changes > 0;
  }

  /* ------------------------------------------------------------------ *
   * Arbitrage rules
   * ------------------------------------------------------------------ */

  listArbitrageRules(): ArbitrageRule[] {
    const rows = tradingDb()
      .prepare(`SELECT * FROM arbitrage_rules ORDER BY created_at DESC`)
      .all() as {
      id: string;
      instrument_id: string;
      buy_exchange: string;
      sell_exchange: string;
      threshold_pct: string;
      enabled: number;
      last_fired_at: number | null;
      created_at: number;
    }[];

    return rows.map((row) => ({
      id: row.id,
      instrumentId: row.instrument_id,
      buyExchange: row.buy_exchange as ExchangeId,
      sellExchange: row.sell_exchange as ExchangeId,
      thresholdPercent: row.threshold_pct,
      enabled: row.enabled === 1,
      lastFiredAt: row.last_fired_at,
      createdAt: row.created_at,
    }));
  }

  upsertArbitrageRule(rule: {
    id?: string;
    instrumentId: string;
    buyExchange: ExchangeId;
    sellExchange: ExchangeId;
    thresholdPercent: string;
    enabled: boolean;
  }): ArbitrageRule {
    const id = rule.id ?? randomUUID();
    const now = Date.now();

    tradingDb()
      .prepare(
        `INSERT INTO arbitrage_rules
           (id, instrument_id, buy_exchange, sell_exchange, threshold_pct, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           threshold_pct = excluded.threshold_pct,
           enabled = excluded.enabled`,
      )
      .run(
        id,
        rule.instrumentId,
        rule.buyExchange,
        rule.sellExchange,
        rule.thresholdPercent,
        rule.enabled ? 1 : 0,
        now,
      );

    const stored = this.listArbitrageRules().find((row) => row.id === id);
    if (!stored) throw new Error("arbitrage rule was not persisted");
    return stored;
  }

  deleteArbitrageRule(id: string): void {
    tradingDb().prepare(`DELETE FROM arbitrage_rules WHERE id = ?`).run(id);
  }

  /**
   * Records that an alert fired, so a spread that stays open does not notify on
   * every poll.
   *
   * Returns false when the rule is still inside its cooldown, which is the
   * caller's signal to stay quiet.
   */
  markArbitrageFired(id: string, cooldownMs: number): boolean {
    const row = tradingDb()
      .prepare(`SELECT last_fired_at FROM arbitrage_rules WHERE id = ?`)
      .get(id) as { last_fired_at: number | null } | undefined;

    const last = row?.last_fired_at ?? null;
    if (last !== null && Date.now() - last < cooldownMs) return false;

    tradingDb()
      .prepare(`UPDATE arbitrage_rules SET last_fired_at = ? WHERE id = ?`)
      .run(Date.now(), id);
    return true;
  }
}

function toPaperOrder(row: PaperOrderRow): Order {
  return {
    id: row.id,
    clientOrderId: row.client_order_id,
    exchange: row.exchange as ExchangeId,
    kind: "spot",
    instrumentId: row.instrument_id,
    symbol: row.symbol,
    side: row.side as OrderSide,
    status: row.status as OrderStatus,
    price: row.price,
    amount: row.amount,
    filledAmount: row.filled_amount,
    averagePrice: row.average_price,
    filledValue: null,
    fee: row.fee,
    feeAsset: row.fee_asset,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    note: row.note,
  };
}

function addStrings(a: string, b: string): string {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  const scale = Math.max(left.scale, right.scale);
  return toPlainString({
    mantissa:
      left.mantissa * 10n ** BigInt(scale - left.scale) +
      right.mantissa * 10n ** BigInt(scale - right.scale),
    scale,
  });
}

function negate(value: string): string {
  const parsed = parseDecimal(value);
  return toPlainString({ mantissa: -parsed.mantissa, scale: parsed.scale });
}
