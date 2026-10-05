import "server-only";

import { AppSignleton } from "~/lib/container";
import { TelegramNotifier } from "~/services/notify/TelegramNotifier";
import { TradingRepository } from "~/repository/trading.repository";
import {
  compare,
  divide,
  multiply,
  parseDecimal,
  roundToScale,
  subtract,
  toPlainString,
} from "~/services/trading/decimal";
import type { ExchangeId } from "~/services/trading/trading.types";
import type { MarketRow } from "~/services/iran/iran.market.types";

/**
 * Cross-venue spread detection.
 *
 * ## What this really measures
 *
 * The board already shows one price per instrument per venue. Comparing two
 * venues and calling the difference an opportunity would be misleading, because
 * a raw spread across two Iranian exchanges is almost never capturable: buying
 * on one venue and selling on another means moving the asset in between, and
 * moving Rial between Iranian exchanges is a manual, slow, sometimes
 * multi-day operation.
 *
 * So this reports two numbers and only calls the second one an opportunity:
 *
 * - `grossSpreadPercent` - what the screen shows, the raw difference.
 * - `netSpreadPercent` - gross minus both venues' taker fees and minus a
 *   configured transfer cost. This is the one the alert threshold applies to,
 *   and the one the UI should lead with.
 *
 * Reporting only the gross figure is the most common way a spread scanner
 * talks someone into a trade that loses money, so the net figure is what the
 * hint and the notification both quote.
 */

/**
 * Per-venue taker fee assumptions, as a fraction of the traded value.
 *
 * These are documented defaults rather than live reads, because the fee schedules
 * are tiered by 30-day volume and a wrong-but-close default is safer than a
 * stale cached value. They are deliberately on the pessimistic side: Nobitex's
 * published taker fee starts at 0.25% on Rial markets and falls with volume.
 */
export const TAKER_FEE: Record<ExchangeId, number> = {
  nobitex: 0.0025,
  wallex: 0.002,
  bitpin: 0.002,
  tabdeal: 0.002,
  bitunix: 0.001,
};

/**
 * Cost of getting the asset or the cash between two venues.
 *
 * A flat allowance per venue pair, in Rial, covering both legs. On the venues
 * here this is dominated by a manual withdrawal rather than a network fee, so
 * it is modelled as a fixed friction instead of a percentage.
 */
export function transferCostRial(from: ExchangeId, to: ExchangeId): number {
  if (from === to) return 0;
  // Two Iranian venues means a withdrawal and a deposit, each with its own
  // delay and minimum. A rough allowance is more honest than pretending it is
  // instant and free.
  return 2_000_000;
}

export type ArbitrageLeg = {
  exchange: ExchangeId;
  /** Best ask when buying, best bid when selling. Rial. */
  priceInRial: string;
  symbol: string;
  /** True when the venue had a live book rather than a crawled quote. */
  live: boolean;
};

export type ArbitrageOpportunity = {
  key: string;
  instrumentId: string;
  label: string;
  buy: ArbitrageLeg;
  sell: ArbitrageLeg;
  /** Best-against-worst, as a percentage of the cheap side. */
  grossSpreadPercent: string;
  /** After fees and transfer cost. The number that decides anything. */
  netSpreadPercent: string;
  /** Net result of moving `notionalRial` through both venues. */
  netProfitRial: string;
  /** Rial value both legs are scaled against. */
  notionalRial: string;
  /** Fees and transfer assumed, for showing the operator the whole cost. */
  totalCostRial: string;
  /** Venues that both quote this instrument with a live book. */
  venues: number;
  /** True when the spread is large enough to clear the configured friction. */
  actionable: boolean;
};

/** How much a scan is worth running for, in Rial. Keeps tiny dust out. */
const NOTIONAL_RIAL = 100_000_000;

@AppSignleton()
export class ArbitrageService {
  constructor(
    private readonly repository: TradingRepository,
    private readonly notifier: TelegramNotifier,
  ) {}

  /**
   * Finds every venue pair worth looking at for each instrument.
   *
   * Uses the ask when looking to buy and the bid when looking to sell, which is
   * the only honest comparison: buying at the mid and selling at the mid
   * double-counts the spread and invents profit that does not exist.
   */
  scan(
    rows: MarketRow[],
    options: { actionableOnly?: boolean } = {},
  ): ArbitrageOpportunity[] {
    const grouped = new Map<string, MarketRow[]>();
    for (const row of rows) {
      if (row.ask === null && row.bid === null) continue;
      const bucket = grouped.get(row.assetId) ?? [];
      bucket.push(row);
      grouped.set(row.assetId, bucket);
    }

    const out: ArbitrageOpportunity[] = [];

    for (const [instrumentId, bucket] of grouped) {
      // A single venue is not a comparison.
      if (bucket.length < 2) continue;

      const asks = bucket
        .filter((row) => row.ask !== null)
        .map((row) => ({
          exchange: row.source as ExchangeId,
          price: parseDecimal(String(row.ask)),
          row,
        }));
      const bids = bucket
        .filter((row) => row.bid !== null)
        .map((row) => ({
          exchange: row.source as ExchangeId,
          price: parseDecimal(String(row.bid)),
          row,
        }));

      if (asks.length === 0 || bids.length === 0) continue;

      const cheapest = asks.reduce((a, b) =>
        compare(b.price, a.price) < 0 ? b : a,
      );
      const richest = bids.reduce((a, b) =>
        compare(b.price, a.price) > 0 ? b : a,
      );

      // Same venue on both sides is not a cross-venue spread.
      if (cheapest.exchange === richest.exchange) continue;

      const gross = divide(
        subtract(richest.price, cheapest.price),
        cheapest.price,
        6,
      );
      const grossPercent = multiply(gross, parseDecimal(100));

      // Both legs pay a taker fee, and moving between venues costs a fixed
      // allowance. Only what survives both is an opportunity.
      const feeCost = multiply(
        cheapest.price,
        parseDecimal(
          String(TAKER_FEE[cheapest.exchange] + TAKER_FEE[richest.exchange]),
        ),
      );
      const fixed = parseDecimal(
        String(transferCostRial(cheapest.exchange, richest.exchange)),
      );

      const perUnitCost = add(
        feeCost,
        scaleDownForFixed(fixed, cheapest.price),
      );
      const net = subtract(
        subtract(richest.price, cheapest.price),
        perUnitCost,
      );
      const netPercent = multiply(
        divide(net, cheapest.price, 6),
        parseDecimal(100),
      );

      const notional = parseDecimal(String(NOTIONAL_RIAL));
      const netProfit = roundToScale(multiply(net, notional), 0);

      const opportunity: ArbitrageOpportunity = {
        key: `${instrumentId}:${cheapest.exchange}>${richest.exchange}`,
        instrumentId,
        label: cheapest.row.upstreamName ?? instrumentId.toUpperCase(),
        buy: {
          exchange: cheapest.exchange,
          priceInRial: toPlainString(cheapest.price),
          symbol: cheapest.row.symbol ?? "",
          live: cheapest.row.live,
        },
        sell: {
          exchange: richest.exchange,
          priceInRial: toPlainString(richest.price),
          symbol: richest.row.symbol ?? "",
          live: richest.row.live,
        },
        grossSpreadPercent: toPlainString(roundToScale(grossPercent, 3)),
        netSpreadPercent: toPlainString(roundToScale(netPercent, 3)),
        netProfitRial: toPlainString(netProfit),
        notionalRial: toPlainString(notional),
        totalCostRial: toPlainString(
          roundToScale(multiply(perUnitCost, notional), 0),
        ),
        venues: bucket.length,
        actionable: compare(net, parseDecimal(0)) > 0,
      };

      if (!options.actionableOnly || opportunity.actionable) {
        out.push(opportunity);
      }
    }

    // Most profitable first, which is the order a trader wants to act in.
    return out.sort((a, b) =>
      compare(
        parseDecimal(b.netSpreadPercent),
        parseDecimal(a.netSpreadPercent),
      ),
    );
  }

  /**
   * Alerts on spreads that have cleared the cost threshold.
   *
   * Fires through the stored rules so that a spread sitting open does not
   * notify on every poll; each rule has its own cooldown.
   */
  async alertOnScan(
    opportunities: ArbitrageOpportunity[],
    cooldownMs = 30 * 60_000,
  ): Promise<number> {
    const rules = this.repository
      .listArbitrageRules()
      .filter((rule) => rule.enabled);
    if (rules.length === 0) return 0;

    let fired = 0;

    for (const rule of rules) {
      const match = opportunities.find(
        (row) =>
          row.instrumentId === rule.instrumentId &&
          row.buy.exchange === rule.buyExchange &&
          row.sell.exchange === rule.sellExchange,
      );

      if (!match) continue;
      if (
        compare(
          parseDecimal(match.netSpreadPercent),
          parseDecimal(rule.thresholdPercent),
        ) < 0
      ) {
        continue;
      }

      if (!this.repository.markArbitrageFired(rule.id, cooldownMs)) continue;

      this.notifier.alert(
        "ARBITRAGE SPREAD",
        [
          `${match.label}`,
          `Buy  ${match.buy.exchange} @ ${match.buy.priceInRial} Rial`,
          `Sell ${match.sell.exchange} @ ${match.sell.priceInRial} Rial`,
          "",
          `Net spread: <b>${match.netSpreadPercent}%</b>`,
          `Net result on ${match.notionalRial} Rial: <b>${match.netProfitRial}</b>`,
          `After fees and transfer: ${match.totalCostRial} Rial`,
        ].join("\n"),
      );
      fired += 1;
    }

    if (fired > 0) await this.notifier.flush();
    return fired;
  }
}

function add(
  a: ReturnType<typeof parseDecimal>,
  b: ReturnType<typeof parseDecimal>,
) {
  const scale = Math.max(a.scale, b.scale);
  return {
    mantissa:
      a.mantissa * 10n ** BigInt(scale - a.scale) +
      b.mantissa * 10n ** BigInt(scale - b.scale),
    scale,
  };
}

/**
 * Spreads a fixed Rial cost over one unit of the asset.
 *
 * A 2,000,000 Rial transfer charge against a 10,580,000,000 Rial gold coin is
 * about 0.19 units, so this has to be exact rather than approximated away.
 */
function scaleDownForFixed(
  fixed: ReturnType<typeof parseDecimal>,
  perUnit: ReturnType<typeof parseDecimal>,
) {
  if (perUnit.mantissa === 0n) return { mantissa: 0n, scale: 0 };
  return divide(fixed, perUnit, 12);
}
