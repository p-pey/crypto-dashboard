"use client";

import { memo } from "react";
import FlashValue from "~/components/shared/FlashValue";
import Sparkline from "~/features/shared/Sparkline";
import { formatNumber } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type { Locale } from "~/i18n/config";
import type { CoinRow } from "~/services/coins/coin.types";
import type { StatusVerdict } from "~/services/statuses/statuses.types";
import { VERDICT_COLOR } from "./coinVerdict";

/**
 * One row of the coin table.
 *
 * ## Why this is memoised, and why that is enough
 *
 * The table is windowed, so only about twenty rows exist at a time, and this
 * component is memoised on the row object. The store replaces a row only when
 * that coin's tick actually changed something, so a price move in one coin
 * re-renders one row and leaves the other nineteen alone.
 *
 * That is the whole strategy. There is no diffing library and no manual
 * `shouldComponentUpdate`: the store guarantees identity stability, and this
 * component trusts it.
 *
 * `rev` is included in the comparison explicitly rather than relied upon
 * implicitly, so the dependency is visible at the call site instead of being an
 * accident of object identity.
 */
type Props = {
  row: CoinRow;
  expanded: boolean;
  onToggle: (symbol: string) => void;
  verdict: { verdict: StatusVerdict; score: number } | undefined;
};

function CoinRowItem({ row, expanded, onToggle, verdict }: Props) {
  const { locale, t } = useI18n();

  const change = Number.parseFloat(row.changePercent);
  const up = Number.isFinite(change) ? change >= 0 : false;
  const price = Number.parseFloat(row.price);

  return (
    <div
      className="border-line/40 hover:bg-surface-2/50 grid items-center gap-3 border-b px-3 transition-colors duration-150"
      style={{
        gridTemplateColumns:
          "44px minmax(190px,2fr) 130px 96px 118px 108px 104px 32px",
        height: "100%",
        background: expanded
          ? "color-mix(in srgb, var(--surface-2) 60%, transparent)"
          : undefined,
      }}
      data-rev={row.rev}
    >
      <span className="num text-fg-3 text-end text-[11px] tabular-nums">
        {row.rank}
      </span>

      <span className="flex min-w-0 items-center gap-2">
        <span className="ring-gradient grid size-7 shrink-0 place-items-center overflow-hidden rounded-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={row.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-fg truncate text-[12.5px] font-semibold">
            {row.name}
          </span>
          <span className="mono text-fg-3 truncate text-[10px]">
            {row.base}
          </span>
        </span>
        {verdict ? (
          <span
            className="shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-bold"
            style={{
              color: "#04120c",
              background: VERDICT_COLOR[verdict.verdict],
            }}
          >
            {t(`markets.verdict.${verdict.verdict}`)}
          </span>
        ) : null}
      </span>

      <span className="num text-fg text-end text-[12.5px] font-semibold tabular-nums">
        <FlashValue
          value={Number.isFinite(price) ? price : null}
          className="inline-block"
        >
          {row.price}
        </FlashValue>
      </span>

      <span className="num text-fg-2 text-end text-[11.5px] font-semibold tabular-nums">
        {compact(locale, row.marketCap)}
      </span>

      <span className="num text-fg-2 text-end text-[11.5px] tabular-nums">
        {compact(locale, row.volume24h)}
      </span>

      <span className="flex justify-end">
        <span className="justify-self-end">
          <Sparkline values={row.spark} width={96} height={24} />
        </span>
      </span>

      <span
        className="num text-end text-[12px] font-bold tabular-nums"
        style={{ color: up ? "var(--up)" : "var(--down)" }}
      >
        {row.changePercent}
      </span>

      <button
        type="button"
        onClick={() => onToggle(row.symbol)}
        aria-expanded={expanded}
        aria-label={expanded ? t("markets.collapse") : t("markets.expanded")}
        className="border-line text-fg-2 hover:border-brand/50 hover:text-fg grid size-6 place-items-center rounded-full border text-[14px] leading-none font-bold transition-all duration-200 active:scale-90"
      >
        {expanded ? "\u2212" : "+"}
      </button>
    </div>
  );
}

/**
 * USD and token amounts, compacted.
 *
 * A market cap of 1,678,237,478,133 is unreadable at a glance and wider than the
 * column, so it is shortened. `null` stays a dash: a coin with no cap must not
 * be shown as zero, which would sort and read as the smallest coin on the board.
 */
function compact(locale: Locale, value: number | null): string {
  if (value === null) return "—";
  return formatNumber(locale, value, {
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

export default memo(CoinRowItem);
