"use client";

import { Tooltip } from "antd";
import { formatNumber } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { venueColor } from "~/features/trading/venueMeta";
import type { Balance } from "~/services/trading/trading.types";

/**
 * Holdings across every configured venue, in one strip.
 *
 * Reading only the assets that actually have a balance. A full account on a real
 * exchange returns a few hundred rows, almost all dust, and a strip that shows
 * three hundred zeroes buries the three numbers that matter.
 */
export default function BalancesStrip({
  rows,
  loading,
}: {
  rows: Balance[];
  loading: boolean;
}) {
  const { locale, t } = useI18n();

  const interesting = rows
    .filter((row) => Number(row.free) > 0 || Number(row.locked) > 0)
    .sort((a, b) => Number(b.total) - Number(a.total));

  if (interesting.length === 0) {
    return (
      <p className="border-line text-fg-3 rounded-[12px] border border-dashed px-4 py-4 text-center text-[11.5px]">
        {loading ? t("common.loading") : t("trading.balances.empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {interesting.map((row) => (
        <Tooltip
          key={`${row.exchange}-${row.asset}`}
          title={`${t("trade.balances.inOrders")}: ${row.locked}`}
        >
          <div className="border-line bg-surface-2/50 min-w-[112px] rounded-[10px] border px-3 py-1.5">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: venueColor(row.exchange) }}
              />
              <span className="text-fg-2 text-[10.5px] font-bold">
                {row.asset}
              </span>
            </span>
            <span className="num text-fg mt-0.5 block text-[13px] font-extrabold tabular-nums">
              {formatNumber(locale, Number(row.free), {
                maximumFractionDigits: 8,
              })}
            </span>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}
