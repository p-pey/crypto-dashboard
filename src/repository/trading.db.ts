import "server-only";

import { mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { env } from "~/env.js";

/**
 * The trading database.
 *
 * Node 24 ships a SQLite driver in core, so persistence costs no new
 * dependency and no native build step.
 *
 * ## What is stored here, and why
 *
 * The operator asked for order history to come from the exchange APIs, and it
 * does: live orders, fills, balances and positions are always read from the
 * venue and never mirrored. This database exists only for the things an
 * exchange cannot tell us:
 *
 * - **the paper ledger**, because a simulated account has no venue to ask;
 * - **the notification outbox**, because Telegram's send has no idempotency key
 *   and a crash between "write" and "send" would otherwise either lose the
 *   message or send it twice with no way to tell which happened;
 * - **arbitrage alert rules and their last-fired times**, so an alert does not
 *   re-notify on every poll while a spread stays open;
 * - **an id map**, so a client order id can still be resolved to a venue order
 *   id after a restart, which matters because Bitpin deletes fully-unfilled
 *   orders after seven days.
 *
 * Money columns are `TEXT`, never `REAL`. SQLite's floating point cannot hold
 * 50,000,000,000 Rial plus five decimal places, and this database holds order
 * sizes for exactly those markets.
 */

export type SqliteDatabase = DatabaseSync;

let instance: SqliteDatabase | null = null;

const SCHEMA = `
-- Simulated balances and orders, used only when TRADING_MODE=paper.
CREATE TABLE IF NOT EXISTS paper_accounts (
  exchange     TEXT NOT NULL,
  asset        TEXT NOT NULL,
  free         TEXT NOT NULL DEFAULT '0',
  locked       TEXT NOT NULL DEFAULT '0',
  PRIMARY KEY (exchange, asset)
);

CREATE TABLE IF NOT EXISTS paper_orders (
  id              TEXT PRIMARY KEY,
  client_order_id TEXT NOT NULL UNIQUE,
  exchange        TEXT NOT NULL,
  instrument_id   TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  side            TEXT NOT NULL,
  price           TEXT NOT NULL,
  amount          TEXT NOT NULL,
  filled_amount   TEXT NOT NULL DEFAULT '0',
  average_price   TEXT,
  fee             TEXT,
  fee_asset       TEXT,
  status          TEXT NOT NULL,
  note            TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS paper_orders_open
  ON paper_orders (exchange, status);

CREATE TABLE IF NOT EXISTS paper_trades (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL,
  exchange        TEXT NOT NULL,
  instrument_id   TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  side            TEXT NOT NULL,
  price           TEXT NOT NULL,
  amount          TEXT NOT NULL,
  value           TEXT NOT NULL,
  fee             TEXT,
  fee_asset       TEXT,
  traded_at       INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES paper_orders (id) ON DELETE CASCADE
);

-- Notification outbox. Rows are written before the send is attempted so that an
-- ambiguous timeout is recoverable rather than a silent duplicate or a gap.
CREATE TABLE IF NOT EXISTS notifications (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,
  payload       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  attempts      INTEGER NOT NULL DEFAULT 0,
  telegram_id   INTEGER,
  last_error    TEXT,
  created_at    INTEGER NOT NULL,
  sent_at       INTEGER
);

CREATE INDEX IF NOT EXISTS notifications_pending
  ON notifications (status, created_at);

-- Protective levels for venues with no exchange-side stop, currently Nobitex
-- margin. These are watched by the cron worker and turned into a reduce order
-- when the price crosses, which is a weaker guarantee than an exchange-side
-- stop and is labelled as such in the UI.
CREATE TABLE IF NOT EXISTS position_protection (
  id              TEXT PRIMARY KEY,
  exchange        TEXT NOT NULL,
  position_id     TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  side            TEXT NOT NULL,
  entry_price     TEXT NOT NULL,
  take_profit     TEXT,
  stop_loss       TEXT,
  status          TEXT NOT NULL DEFAULT 'armed',
  note            TEXT,
  created_at      INTEGER NOT NULL,
  triggered_at    INTEGER,
  UNIQUE (exchange, position_id)
);

CREATE INDEX IF NOT EXISTS position_protection_armed
  ON position_protection (status, created_at);

-- Arbitrage alert rules and their cooldowns.
CREATE TABLE IF NOT EXISTS arbitrage_rules (
  id            TEXT PRIMARY KEY,
  instrument_id TEXT NOT NULL,
  buy_exchange  TEXT NOT NULL,
  sell_exchange TEXT NOT NULL,
  threshold_pct TEXT NOT NULL,
  enabled       INTEGER NOT NULL DEFAULT 1,
  last_fired_at INTEGER,
  created_at    INTEGER NOT NULL
);

-- Which venue order a client order id became, so a cancel still works after a
-- restart and Bitpin's seven-day purge has removed the row from the venue.
CREATE TABLE IF NOT EXISTS order_id_map (
  client_order_id TEXT PRIMARY KEY,
  exchange        TEXT NOT NULL,
  venue_order_id  TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);
`;

/**
 * Opens (once) and migrates the trading database.
 *
 * A singleton because `node:sqlite` is synchronous and cheap, and because the
 * schema is only ever applied once per process. Next.js hot-reloads modules in
 * development, so the handle is cached on `globalThis` to avoid leaking a new
 * connection on every edit.
 */
export function tradingDb(): SqliteDatabase {
  if (instance) return instance;

  /*
   * The configured value contributes only the file name, never the directory.
   *
   * Two reasons. It keeps the resolved path statically scoped to `.data`, which
   * stops the bundler from tracing the whole project because a filesystem write
   * could land anywhere. And it makes a hostile or mistaken `TRADING_DB_PATH`
   * such as `../../etc/something` harmless, because only its basename is used.
   */
  const file = `${basename(env.TRADING_DB_PATH) || "trading.sqlite"}`;
  const directory = join(process.cwd(), ".data");
  mkdirSync(directory, { recursive: true });

  const db = new DatabaseSync(join(directory, file));

  // WAL keeps the notification writer from blocking the dashboard reader, and
  // FULL synchronous is chosen over NORMAL because a lost notification
  // outbox row means a silently dropped trade message.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = FULL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);

  instance = db;
  return db;
}

/** Runs `work` inside a transaction, rolling back on any throw. */
export function transact<T>(work: (db: SqliteDatabase) => T): T {
  const db = tradingDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Used by tests to start from a clean file. */
export function resetTradingDb(): void {
  instance?.close();
  instance = null;
}
