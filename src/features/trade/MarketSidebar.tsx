"use client";

import { Input } from "antd";
import { useMemo, useState } from "react";
import { useI18n } from "~/i18n/I18nProvider";
import { venueColor, venueLabel } from "~/features/trading/venueMeta";
import type { ExchangeId } from "~/services/trading/trading.types";

/**
 * The market picker.
 *
 * A venue-and-market list rather than a free-text symbol entry, because the whole
 * point of the earlier work was that the venues disagree about almost everything:
 * `XAUTIRT` on Nobitex is Rial, `XAUTTMN` on Wallex is Toman, and `XAUT_USDT` on
 * Tabdeal's futures is a different instrument with different leverage. Typing a
 * symbol would hide exactly the information the operator needs.
 *
 * Spot and futures markets are kept in separate lists rather than mixed, because
 * the two have genuinely different mechanics: a futures row carries its leverage
 * ceiling and a spot row does not.
 */
export type MarketChoice = {
  exchange: ExchangeId;
  instrumentId: string;
  symbol: string;
  /** `margin` and `futures` rows only exist on the venues that offer them. */
  kind: "spot" | "margin" | "futures";
  maxLeverage: string | null;
};

type Props = {
  choices: MarketChoice[];
  selected: MarketChoice | null;
  onSelect: (choice: MarketChoice) => void;
  loading: boolean;
};

export default function MarketSidebar({
  choices,
  selected,
  onSelect,
  loading,
}: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return choices;
    return choices.filter(
      (row) =>
        row.instrumentId.toLowerCase().includes(needle) ||
        row.symbol.toLowerCase().includes(needle) ||
        venueLabel(row.exchange).toLowerCase().includes(needle),
    );
  }, [choices, query]);

  return (
    <aside className="border-line flex min-h-0 flex-col overflow-hidden rounded-[14px] border">
      <div className="border-line bg-surface-2/70 flex flex-col gap-2 border-b px-3 py-2.5">
        <span className="text-fg-2 text-[11px] font-bold tracking-[0.12em] uppercase">
          {t("trade.market.title")}
        </span>
        <Input
          size="small"
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("trade.market.search")}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {choices.length === 0 ? (
          <p className="text-fg-3 px-3 py-6 text-center text-[11.5px]">
            {loading ? t("common.loading") : t("trade.market.none")}
          </p>
        ) : (
          filtered.map((row) => {
            const active =
              selected?.exchange === row.exchange &&
              selected.instrumentId === row.instrumentId &&
              selected.kind === row.kind;

            return (
              <button
                key={`${row.exchange}-${row.kind}-${row.instrumentId}`}
                type="button"
                onClick={() => onSelect(row)}
                aria-pressed={active}
                className={`flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-start transition-colors ${
                  active ? "bg-surface-2" : "hover:bg-surface-2/50"
                }`}
              >
                <span className="text-fg w-full truncate text-[12.5px] font-bold">
                  {row.instrumentId.toUpperCase()}
                </span>
                <span className="flex w-full items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: venueColor(row.exchange) }}
                  />
                  <span className="text-fg-2 text-[10.5px]">
                    {venueLabel(row.exchange)}
                  </span>
                  <span className="mono text-fg-3 truncate text-[10px]">
                    {row.symbol}
                  </span>
                  {row.kind !== "spot" ? (
                    <span className="text-brand-2 ms-auto text-[9px] font-bold">
                      {row.kind === "futures"
                        ? t("trade.kind.futures")
                        : t("trade.kind.margin")}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
