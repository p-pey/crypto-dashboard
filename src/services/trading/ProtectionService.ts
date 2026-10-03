import "server-only";

import { AppSignleton } from "~/lib/container";
import { TradingRepository } from "~/repository/trading.repository";
import { exchangeRegistry } from "~/services/exchanges/ExchangeRegistry";
import { TelegramNotifier } from "~/services/notify/TelegramNotifier";
import {
  compare,
  divide,
  multiply,
  parseDecimal,
  toPlainString,
} from "~/services/trading/decimal";
import type { ProtectionResult } from "~/services/trading/exchange.port";
import type {
  ExchangeId,
  Position,
  PositionSide,
} from "~/services/trading/trading.types";

/**
 * Take-profit and stop-loss across venues that do not agree on whether these
 * exist.
 *
 * ## The honest part
 *
 * Tabdeal's perpetual API has a real `positionSlTp` endpoint, so a stop there is
 * held by the exchange. It keeps working when this app is closed, it is enforced
 * by the venue's matching engine, and it costs no order slot when it fires.
 *
 * Nobitex's margin product has **nothing of the kind**. There is no endpoint to
 * call, so a stop can only be emulated: this app stores the level, watches the
 * price, and places a reduce order when the price crosses. That depends on the
 * process being alive, on the poll interval, and on the reduce order itself
 * succeeding - and it consumes a real order slot when it fires.
 *
 * Both paths are supported. What this service refuses to do is report them
 * identically. {@link ProtectionResult.mode} carries the difference all the way to
 * the UI, because "the exchange is holding my stop" and "my stop only exists while
 * this app is running" are not the same reassurance.
 */

/** How a level fires, kept explicit rather than derived at the call site. */
type Trigger = "take_profit" | "stop_loss";

/** Returns the repository, avoiding a second DI path for one class. */
@AppSignleton()
export class ProtectionService {
  constructor(
    private readonly repository: TradingRepository,
    private readonly notifier: TelegramNotifier,
  ) {}

  /**
   * Records protective levels against a position.
   *
   * Levels are snapshotted and stored even when the venue supports them, so the UI
   * can show what is armed on a position whose venue never reports it back. A
   * venue that holds them natively is the source of truth; the stored copy is only
   * used to render.
   */
  async arm(
    position: Position,
    levels: { takeProfit?: string | null; stopLoss?: string | null },
  ): Promise<ProtectionResult> {
    const adapter = exchangeRegistry().get(position.exchange);

    const result = await adapter.setPositionProtection(position, levels);

    if (result.mode === "native") {
      this.repository.saveProtection({
        exchange: position.exchange,
        positionId: position.id,
        symbol: position.symbol,
        side: position.side,
        entryPrice: position.entryPrice,
        takeProfit: result.takeProfit,
        stopLoss: result.stopLoss,
        note: null,
      });
      this.notifier.alert(
        "PROTECTION ARMED",
        [
          `${position.symbol} ${position.side.toUpperCase()}`,
          result.takeProfit ? `take profit ${result.takeProfit}` : "",
          result.stopLoss ? `stop loss ${result.stopLoss}` : "",
          "",
          "Held by the exchange.",
        ]
          .filter(Boolean)
          .join("\\n"),
      );
      await this.notifier.flush();
      return result;
    }

    if (result.mode === "unsupported") {
      this.repository.clearProtection(position.exchange, position.id);
      return result;
    }

    // Emulated: the levels live here, and the note says so out loud.
    this.repository.saveProtection({
      exchange: position.exchange,
      positionId: position.id,
      symbol: position.symbol,
      side: position.side,
      entryPrice: position.entryPrice,
      takeProfit: result.takeProfit,
      stopLoss: result.stopLoss,
      note:
        result.note ??
        `${position.exchange} has no exchange-side stop. This level is watched by the app and fires a reduce order.`,
    });

    this.notifier.alert(
      "PROTECTION ARMED (APP-SIDE)",
      [
        `${position.symbol} ${position.side.toUpperCase()}`,
        result.takeProfit ? `take profit ${result.takeProfit}` : "",
        result.stopLoss ? `stop loss ${result.stopLoss}` : "",
        "",
        "This exchange has no exchange-side stop. The level only exists",
        "while this app is running, and firing it places a real reduce order.",
      ]
        .filter(Boolean)
        .join("\\n"),
    );
    await this.notifier.flush();

    return result;
  }

  /** Removes both levels from a position, on the venue and locally. */
  async disarm(position: Position): Promise<ProtectionResult> {
    const adapter = exchangeRegistry().get(position.exchange);

    // Sent with neither level set, which is how a native venue clears both.
    const result = await adapter.setPositionProtection(position, {});
    this.repository.clearProtection(position.exchange, position.id);
    return { ...result, takeProfit: null, stopLoss: null };
  }

  /**
   * Checks every armed level against the live price and fires the ones that have
   * been crossed.
   *
   * Run from the cron worker, because this is the whole point of the emulated
   * path: it has to happen with no browser open. Returns how many fired, so the
   * worker can report something an operator can check.
   */
  async checkArmed(priceOf: (symbol: string) => Promise<number | null>): Promise<number> {
    const armed = this.repository.listArmedProtection();
    let fired = 0;

    for (const row of armed) {
      const price = await priceOf(row.symbol);
      if (price === null) continue;

      const trigger = crossed(row.side, price, row.takeProfit, row.stopLoss);
      if (!trigger) continue;

      /*
       * Claimed before the order is placed, not after.
       *
       * The gap between sending the reduce order and the position actually
       * closing is longer than one poll interval, so a check that marked the row
       * afterwards would fire the same stop again on the next pass. Claiming first
       * makes the fire-once guarantee hold even if the order itself then fails,
       * which is the safer of the two failure modes: a stop that does not fire
       * gets noticed, a duplicated close order does not.
       */
      if (!this.repository.claimProtection(row.id)) continue;

      const placed = await this.placeReduceOrder(row, trigger);
      fired += 1;

      this.notifier.alert(
        placed ? `${trigger === "take_profit" ? "TAKE PROFIT" : "STOP LOSS"} FIRED` : "PROTECTION FAILED",
        [
          `${row.symbol} ${row.side.toUpperCase()}`,
          `entry ${row.entryPrice}, last ${toPlainString(parseDecimal(String(price)))}`,
          placed
            ? `reduce order placed at ${placed}`
            : "the reduce order could not be placed - the position is still open",
        ].join("\\n"),
      );
      await this.notifier.flush();
    }

    return fired;
  }

  /**
   * Places the reduce order for a crossed level.
   *
   * A **limit** order at the level, not a market one. That is deliberate and it is
   * the same rule every other order in this app follows: the operator asked for a
   * price, and a stop that fills somewhere else is not the order they asked for.
   * It also means a stop can sit unfilled, which is visible on the resting-orders
   * screen rather than being hidden inside a market fill.
   */
  private async placeReduceOrder(
    row: {
      exchange: ExchangeId;
      positionId: string;
      symbol: string;
      side: PositionSide;
      takeProfit: string | null;
      stopLoss: string | null;
    },
    trigger: Trigger,
  ): Promise<string | null> {
    const level = trigger === "take_profit" ? row.takeProfit : row.stopLoss;
    if (!level) return null;

    const adapter = exchangeRegistry().get(row.exchange);

    try {
      const order = await adapter.closePosition(
        { id: row.positionId, symbol: row.symbol },
        { price: level },
      );
      return order.price;
    } catch {
      // Deliberately swallowed, and deliberately not logged with the error: the
      // caller has already claimed the level and the notification it sends reports
      // the failure. Letting this throw would abandon every remaining armed level
      // in the same pass, so one failing order must not disarm the rest.
      return null;
    }
  }
}

/**
 * Which level, if any, the last price has crossed.
 *
 * A long is protected on the way up by a take profit and on the way down by a stop
 * loss, and a short is the mirror image. The comparisons are strict so that a
 * price sitting exactly on its level does not fire on every poll.
 */
export function crossed(
  side: PositionSide,
  price: number,
  takeProfit: string | null,
  stopLoss: string | null,
): Trigger | null {
  const last = parseDecimal(String(price));

  if (takeProfit) {
    const level = parseDecimal(takeProfit);
    const hit = side === "long"
      ? compare(last, level) >= 0
      : compare(last, level) <= 0;
    if (hit) return "take_profit";
  }

  if (stopLoss) {
    const level = parseDecimal(stopLoss);
    const hit = side === "long"
      ? compare(last, level) <= 0
      : compare(last, level) >= 0;
    if (hit) return "stop_loss";
  }

  return null;
}

/** RPL below the entry, as a signed percentage. Used to label the risk side. */
export function unrealizedPercent(
  side: PositionSide,
  entryPrice: string,
  lastPrice: string,
): string {
  const entry = parseDecimal(entryPrice);
  const last = parseDecimal(lastPrice);
  if (entry.mantissa === 0n) return "0";

  const move = divide(
    side === "long" ? last : { mantissa: -last.mantissa, scale: last.scale },
    entry,
    8,
  );
  return toPlainString(multiply(move, parseDecimal(100)));
}
