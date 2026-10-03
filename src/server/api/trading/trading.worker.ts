import "server-only";

import { AppContainer } from "~/lib/container";
import { IR_ASSETS } from "~/constants/iranExchanges";
import { exchangeRegistry } from "~/services/exchanges/ExchangeRegistry";
import { ArbitrageService } from "~/services/trading/ArbitrageService";
import { ProtectionService } from "~/services/trading/ProtectionService";
import { TelegramNotifier } from "~/services/notify/TelegramNotifier";
import { parseDecimal, toNumber } from "~/services/trading/decimal";
import type { MarketRow } from "~/services/iran/iran.market.types";
import { RIAL_PER_TOMAN } from "~/services/nerkh/nerkh.types";

/**
 * The unattended half of the trading service.
 *
 * The browser holds the exchange websockets, but an alert that is meant to
 * arrive at three in the morning cannot depend on somebody having a tab open.
 * This fetches the books itself and runs the same spread calculation the
 * dashboard uses, so the two can never disagree about what an opportunity is.
 *
 * It deliberately reuses each adapter's own book fetcher rather than
 * reimplementing REST calls, which means the Rial/Toman normalisation, the
 * symbol spelling and the pacing rules are the same code paths in both places.
 */

const Arbitrage = AppContainer.resolve(ArbitrageService);
const Notifier = AppContainer.resolve(TelegramNotifier);
const Protection = AppContainer.resolve(ProtectionService);

/**
 * One pass of the worker.
 *
 * Reads a book from every venue that lists a tracked instrument and feeds the
 * resulting rows to the shared scanner. A venue that fails is skipped rather
 * than aborting the pass: three prices still describe a spread, and one error
 * should not silence the alert.
 */
export async function runTradingWorker(): Promise<{
  ok: boolean;
  venuesProbed: number;
  venuesFailed: number;
  comparisons: number;
  alertsSent: number;
  protectionFired: number;
  telegramDelivered: number;
  at: number;
}> {
  const adapters = exchangeRegistry().all();
  const rows: MarketRow[] = [];
  let failed = 0;

  for (const adapter of adapters) {
    for (const asset of IR_ASSETS) {
      const spec = adapter.marketSpec(asset.id);
      if (!spec) continue;

      try {
        const book = await adapter.getOrderBook(spec.symbol);
        if (!book || book.bids.length === 0 || book.asks.length === 0) continue;

        // Both sides are converted to Rial here so the scanner, and every
        // spread the operator has ever been shown, is on one scale.
        const scale = spec.quoteInToman ? RIAL_PER_TOMAN : 1;
        // The scanner's row type is the price board's, whose source union
        // predates BitUnix. Only the four board venues reach here, so the
        // narrowing is real rather than a cast over something unhandled.
        const source = adapter.id as MarketRow["source"];
        rows.push({
          key: `${adapter.id}:${asset.id}`,
          source,
          assetId: asset.id,
          baseAsset: spec.baseAsset,
          category: asset.kind === "gold" ? "gold" : "stablecoin",
          labelKey: asset.labelKey,
          upstreamName: null,
          symbol: spec.symbol,
          bid: toNumber(parseDecimal(book.bids[0]?.[0] ?? "0")) * scale,
          ask: toNumber(parseDecimal(book.asks[0]?.[0] ?? "0")) * scale,
          mid: null,
          spark: [],
          changePercent: null,
          changeWindowHours: null,
          live: false,
          status: "live",
          error: null,
          updatedAt: Date.now(),
        });
      } catch {
        failed += 1;
      }
    }
  }

  /*
   * Emulated protective levels are checked against the books this pass already
   * fetched, so arming a stop costs nothing beyond the pass that was going to
   * happen anyway.
   */
  // Both the symbol and the ask are nullable on the row model, because a source
  // that cannot name or price a market leaves them null rather than absent. The
  // rows built above always set them, so the guards narrow to the usable case.
  const lastPrice = new Map<string, number>();
  for (const row of rows) {
    if (row.symbol === null || row.ask === null) continue;
    lastPrice.set(row.symbol, row.ask);
  }
  const protectionFired = await Protection.checkArmed(async (symbol) => {
    const cached = lastPrice.get(symbol);
    if (cached !== undefined) return cached;
    /*
     * A symbol this pass did not quote still needs a price, so the venue's own
     * book is fetched rather than leaving an armed level unchecked. Every
     * instrument is searched, not just gold: an armed level on a USDT market is
     * just as real as one on XAUT.
     */
    for (const adapter of adapters) {
      for (const asset of IR_ASSETS) {
        const spec = adapter.marketSpec(asset.id);
        if (spec?.symbol !== symbol) continue;
        const book = await adapter.getOrderBook(symbol);
        const best = book?.asks[0]?.[0] ?? book?.bids[0]?.[0];
        if (best !== undefined) return toNumber(parseDecimal(best));
      }
    }
    return null;
  });

  const opportunities = Arbitrage.scan(rows);
  const alertsSent = await Arbitrage.alertOnScan(opportunities);
  const telegramDelivered = await Notifier.flush();

  return {
    ok: true,
    venuesProbed: adapters.length,
    venuesFailed: failed,
    comparisons: opportunities.length,
    alertsSent,
    protectionFired,
    telegramDelivered,
    at: Date.now(),
  };
}
