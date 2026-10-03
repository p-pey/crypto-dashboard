"use client";

import { Tooltip } from "antd";
import { memo } from "react";
import Sparkline from "~/features/shared/Sparkline";
import { formatNumber, formatPercent } from "~/i18n/format";
import { PanelSection, Stat, toneForSign, type Tone } from "~/components/ui";

/**
 * A signed change maps to a tone, with the same dead zone the scorecard uses:
 * +0.02% is noise and should not be painted green.
 */
function hintToneOf(value: number | null | undefined): Tone | null {
  return toneForSign(value, 0.05);
}
import { useI18n } from "~/i18n/I18nProvider";
import type { Locale } from "~/i18n/config";
import type { CoinRow } from "~/services/coins/coin.types";
import CoinStatusPanel from "~/features/statuses/CoinStatusPanel";

/**
 * What an expanded row shows.
 *
 * Everything here was already being fetched and thrown away. CoinGecko's
 * `coins/markets` carries market cap, the three supply figures, FDV, the 24h
 * range and the all-time high; Binance's `24hrTicker` stream carries the bid, the
 * ask, the spread and the trade count. The old mapper kept six fields out of the
 * lot, which is why the table could not show anything.
 *
 * The layout follows one rule: figures that let the operator judge **whether a
 * number is meaningful** sit next to the number. A 0.05% spread means something
 * only next to the trade count; a 3% move means something only next to the volume
 * behind it. Grouping by that turns a wall of statistics into an argument.
 */

/** Compact USD for the large figures; a cap of $1.2T reads better than digits. */
function compactUsd(locale: Locale, value: number | null): string {
  if (value === null) return "—";
  return formatNumber(locale, value, {
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

/** Token amounts, which run from millions to billions depending on the coin. */
function compactUnits(locale: Locale, value: number | null): string {
  if (value === null) return "—";
  return formatNumber(locale, value, {
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

type Props = {
  row: CoinRow;
  /** Rendered lazily by the caller so the status analysis is not built eagerly. */
  withStatus: boolean;
};

function CoinDetailPanel({ row, withStatus }: Props) {
  const { locale, t } = useI18n();

  const high =
    row.venueHigh24h ?? (row.high24h === null ? null : String(row.high24h));
  const low =
    row.venueLow24h ?? (row.low24h === null ? null : String(row.low24h));
  const price = Number.parseFloat(row.price);

  /**
   * Where the price sits inside its 24h range.
   *
   * Returns null when the range is missing or inverted, which is what a
   * coin with no trades in the window looks like; a bar in that state would
   * imply a position that does not exist.
   */
  const range = positionInRange(price, low, high);

  const supplyRatio =
    row.maxSupply !== null &&
    row.maxSupply > 0 &&
    row.circulatingSupply !== null
      ? Math.min(100, (row.circulatingSupply / row.maxSupply) * 100)
      : null;

  const fdvPremium =
    row.fdv !== null && row.marketCap !== null && row.marketCap > 0
      ? ((row.fdv - row.marketCap) / row.marketCap) * 100
      : null;

  return (
    <div className="border-line/60 bg-surface-2/25 grid gap-4 border-t px-4 py-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
      {/* -------- Valuation -------- */}
      <PanelSection title={t("markets.detail.valuation")}>
        <Stat
          label={t("markets.detail.marketCap")}
          value={compactUsd(locale, row.marketCap)}
          hint={
            row.marketCapChange24h === null
              ? undefined
              : t("markets.detail.marketCapChange")
          }
          hintValue={
            row.marketCapChange24h === null
              ? undefined
              : formatPercent(locale, row.marketCapChange24h, 2)
          }
          hintTone={hintToneOf(row.marketCapChange24h)}
        />
        <Stat
          label={t("markets.detail.fdv")}
          value={compactUsd(locale, row.fdv)}
          hint={
            fdvPremium === null
              ? t("markets.detail.sameAsCap")
              : t("markets.detail.fdvPremium")
          }
          hintValue={
            fdvPremium === null
              ? undefined
              : formatPercent(locale, fdvPremium, 1)
          }
          hintTone={hintToneOf(fdvPremium)}
        />
        <Stat
          label={t("markets.detail.volume24h")}
          value={compactUsd(locale, row.volume24h)}
          hint={t("markets.detail.volumeOverCap")}
          hintValue={
            row.volume24h !== null &&
            row.marketCap !== null &&
            row.marketCap > 0
              ? `${((row.volume24h / row.marketCap) * 100).toFixed(1)}%`
              : undefined
          }
        />
        <Stat
          label={t("markets.detail.rank")}
          value={row.marketCapRank === null ? "—" : `#${row.marketCapRank}`}
        />
      </PanelSection>

      {/* -------- Supply -------- */}
      <PanelSection title={t("markets.detail.supply")}>
        <Stat
          label={t("markets.detail.circulating")}
          value={compactUnits(locale, row.circulatingSupply)}
        />
        <Stat
          label={t("markets.detail.total")}
          value={compactUnits(locale, row.totalSupply)}
        />
        <Stat
          label={t("markets.detail.max")}
          value={compactUnits(locale, row.maxSupply)}
        />
        {supplyRatio !== null ? (
          <div className="col-span-full flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="text-fg-3">{t("markets.detail.mined")}</span>
              <span className="num text-fg-2 font-bold tabular-nums">
                {supplyRatio.toFixed(1)}%
              </span>
            </div>
            <div className="bg-surface-3 h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="from-brand to-brand-2 h-full rounded-full bg-gradient-to-r"
                style={{ width: `${supplyRatio}%` }}
              />
            </div>
          </div>
        ) : null}
      </PanelSection>

      {/* -------- Range and liquidity -------- */}
      <PanelSection title={t("markets.detail.range")}>
        <Stat label={t("markets.detail.high24h")} value={high ?? "—"} />
        <Stat label={t("markets.detail.low24h")} value={low ?? "—"} />

        {range ? (
          <div className="col-span-full flex flex-col gap-1.5 pt-1">
            <Tooltip title={t("markets.detail.rangeHint")}>
              <div className="bg-surface-3 relative h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className="from-cyan to-brand-2 absolute inset-y-0 rounded-full bg-gradient-to-r"
                  style={{ left: `${range.position}%`, width: 2 }}
                />
              </div>
            </Tooltip>
            <span className="text-fg-3 text-[10px]">
              {t("markets.detail.positionInRange")} {range.position.toFixed(0)}%
            </span>
          </div>
        ) : null}

        <Stat
          label={t("markets.detail.spread")}
          value={row.spreadPercent === null ? "—" : `${row.spreadPercent}%`}
          hint={t("markets.detail.spreadHint")}
        />
        <Stat
          label={t("markets.detail.trades")}
          value={
            row.trades === null
              ? "—"
              : formatNumber(locale, row.trades, { maximumFractionDigits: 0 })
          }
          hint={t("markets.detail.tradesHint")}
        />
        <Stat label={t("markets.detail.bestBid")} value={row.bestBid ?? "—"} />
        <Stat label={t("markets.detail.bestAsk")} value={row.bestAsk ?? "—"} />
      </PanelSection>

      {/* -------- 7d trend and extremes -------- */}
      <div className="border-line/60 bg-surface-2/20 col-span-full flex flex-wrap items-center gap-6 rounded-[12px] border px-4 py-3">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="text-fg-3 text-[10px] font-bold tracking-[0.12em] uppercase">
            {t("markets.detail.sevenDay")}
          </span>
          <Sparkline values={row.spark7d} width={220} height={38} />
        </div>

        <Stat
          label={t("markets.detail.ath")}
          value={row.ath === null ? "—" : compactUsd(locale, row.ath)}
          hint={t("markets.detail.fromAth")}
          hintValue={
            row.athChangePercent === null
              ? undefined
              : formatPercent(locale, row.athChangePercent, 1)
          }
          hintTone={hintToneOf(row.athChangePercent)}
        />
        <Stat
          label={t("markets.detail.atl")}
          value={row.atl === null ? "—" : compactUsd(locale, row.atl)}
        />
      </div>

      {/* The status analysis is a network fetch plus an LLM pass, so it only
          mounts once the operator has actually opened this row. */}
      {withStatus ? (
        <div className="col-span-full">
          <CoinStatusPanel
            coinId={row.id}
            symbol={row.symbol}
            name={row.name}
          />
        </div>
      ) : null}
    </div>
  );
}

export default memo(CoinDetailPanel);

/* -------------------------------------------------------------------- *
 * Pieces
 * -------------------------------------------------------------------- */

/** Percentage of the way up the 24h range the current price sits. */
function positionInRange(
  price: number,
  low: string | null,
  high: string | null,
): { position: number } | null {
  if (!Number.isFinite(price) || low === null || high === null) return null;
  const bottom = Number.parseFloat(low);
  const top = Number.parseFloat(high);
  if (!Number.isFinite(bottom) || !Number.isFinite(top)) return null;
  // A flat range is a coin with no movement; any marker position would be a lie.
  if (top <= bottom) return null;

  return {
    position: Math.min(
      100,
      Math.max(0, ((price - bottom) / (top - bottom)) * 100),
    ),
  };
}
