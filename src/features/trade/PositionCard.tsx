"use client";

import { Alert, Input, Popconfirm, Tag, Tooltip } from "antd";
import { useState } from "react";
import { venueColor, venueLabel } from "~/features/trading/venueMeta";
import { useI18n } from "~/i18n/I18nProvider";
import type {
  ExchangeId,
  PositionSide,
} from "~/services/trading/trading.types";
import { api } from "~/trpc/react";

/**
 * One open leveraged position, and the protective levels on it.
 *
 * ## The thing this component exists to communicate
 *
 * A take-profit and a stop-loss are the same two numbers everywhere, but they do
 * not mean the same thing. On Tabdeal's perpetuals the venue holds them: they
 * survive this process being closed and are enforced by its matching engine. On
 * Nobitex margin there is no such endpoint at all, so the level lives in this app
 * and fires a limit reduce order when the price crosses.
 *
 * Presenting both with the same green tick would be the most damaging thing this
 * screen could do, because the operator would reasonably read it as "the exchange
 * has my stop" when in one case the stop is a note in a local database. So the
 * mode is fetched with the position, shown on the control itself, and explained
 * in a tooltip before the levels are armed rather than after.
 */
type Props = {
  position: {
    id: string;
    exchange: ExchangeId;
    symbol: string;
    instrumentId: string;
    side: PositionSide;
    size: string;
    entryPrice: string;
    leverage: string | null;
    unrealizedPnl: string | null;
    unrealizedPnlPercent: string | null;
    liquidationPrice: string | null;
    takeProfit: string | null;
    stopLoss: string | null;
    protectionMode: "native" | "emulated";
    protectionNote: string | null;
  };
  secret: string;
  onChanged: () => void;
};

export default function PositionCard({ position, secret, onChanged }: Props) {
  const { t } = useI18n();
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [open, setOpen] = useState(false);

  const arm = api.trading.setProtection.useMutation({
    onSuccess: () => {
      setTakeProfit("");
      setStopLoss("");
      onChanged();
    },
  });

  const long = position.side === "long";
  const pnl =
    position.unrealizedPnl === null ? null : Number(position.unrealizedPnl);

  return (
    <div className="border-line bg-surface-2/40 flex flex-col gap-3 rounded-[12px] border px-3.5 py-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: venueColor(position.exchange) }}
          />
          <span className="text-fg text-[13px] font-bold">
            {position.instrumentId.toUpperCase()}
          </span>
          <Tag
            color={long ? "green" : "red"}
            style={{ marginInlineEnd: 0, fontWeight: 700 }}
          >
            {position.side.toUpperCase()}
          </Tag>
          <span className="text-fg-3 text-[10.5px]">
            {venueLabel(position.exchange)}
          </span>
        </span>

        <span className="flex items-center gap-2">
          {position.leverage ? (
            <Tag style={{ marginInlineEnd: 0 }}>{position.leverage}x</Tag>
          ) : null}
          <span
            className="num text-[13px] font-extrabold tabular-nums"
            style={{
              color:
                pnl === null
                  ? "var(--text-3)"
                  : pnl >= 0
                    ? "var(--up)"
                    : "var(--down)",
            }}
          >
            {t("trade.futures.pnl")} {position.unrealizedPnl ?? "—"}
          </span>
        </span>
      </header>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 md:grid-cols-4">
        <Field label={t("trade.order.amount")} value={position.size} />
        <Field
          label={t("trade.futures.markPrice")}
          value={position.entryPrice}
        />
        <Field
          label={t("trade.futures.liquidation")}
          value={position.liquidationPrice ?? "—"}
          tone="var(--down)"
        />
        <Field
          label={t("common.status")}
          value={
            position.takeProfit || position.stopLoss
              ? t("trade.protection.armed")
              : t("trade.protection.none")
          }
          tone={
            position.takeProfit || position.stopLoss
              ? "var(--mint)"
              : "var(--text-3)"
          }
        />
      </div>

      {/* -------------------------------------------------- protection */}
      <div className="border-line flex flex-col gap-2 border-t pt-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-fg-2 text-[11px] font-bold">
            {t("trade.protection.title")}
          </span>
          <Tooltip
            title={
              position.protectionMode === "native"
                ? t("trade.protection.nativeHint")
                : (position.protectionNote ??
                  t("trade.protection.emulatedHint"))
            }
          >
            {/* The tag is the warning, not decoration: it is the difference
                between "the exchange has my stop" and "this app has my stop". */}
            <Tag
              color={position.protectionMode === "native" ? "green" : "orange"}
              style={{ marginInlineEnd: 0, cursor: "help", fontWeight: 700 }}
            >
              {position.protectionMode === "native"
                ? t("trade.protection.native")
                : t("trade.protection.emulated")}
            </Tag>
          </Tooltip>
        </div>

        {position.protectionMode === "emulated" ? (
          <Alert
            type="warning"
            showIcon
            message={t("trade.protection.emulatedHint")}
            className="text-[11px]"
          />
        ) : null}

        {open ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-fg-3 text-[10.5px]">
                  {t("trade.protection.takeProfit")}
                </span>
                <Input
                  value={takeProfit}
                  onChange={(event) => setTakeProfit(event.target.value.trim())}
                  inputMode="decimal"
                  placeholder={
                    position.takeProfit ??
                    (long ? "above entry" : "below entry")
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-fg-3 text-[10.5px]">
                  {t("trade.protection.stopLoss")}
                </span>
                <Input
                  value={stopLoss}
                  onChange={(event) => setStopLoss(event.target.value.trim())}
                  inputMode="decimal"
                  placeholder={
                    position.stopLoss ?? (long ? "below entry" : "above entry")
                  }
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={
                  arm.isPending ||
                  (takeProfit.length === 0 && stopLoss.length === 0)
                }
                onClick={() =>
                  arm.mutate({
                    secret,
                    positionId: position.id,
                    exchange: position.exchange,
                    symbol: position.symbol,
                    instrumentId: position.instrumentId,
                    side: position.side,
                    entryPrice: position.entryPrice,
                    takeProfit: takeProfit.length > 0 ? takeProfit : null,
                    stopLoss: stopLoss.length > 0 ? stopLoss : null,
                    clear: false,
                  })
                }
                className="from-brand to-brand-2 text-fg-1 h-8 rounded-full bg-gradient-to-br px-4 text-[11.5px] font-bold transition-all duration-300 active:scale-95 disabled:opacity-50"
              >
                {t("trade.protection.arm")}
              </button>

              <Popconfirm
                title={t("trade.protection.clear")}
                onConfirm={() =>
                  arm.mutate({
                    secret,
                    positionId: position.id,
                    exchange: position.exchange,
                    symbol: position.symbol,
                    instrumentId: position.instrumentId,
                    side: position.side,
                    entryPrice: position.entryPrice,
                    clear: true,
                  })
                }
              >
                <button
                  type="button"
                  disabled={arm.isPending}
                  className="border-line text-fg-2 hover:border-rose/50 hover:text-rose h-8 rounded-full border px-4 text-[11.5px] font-bold transition-all duration-300 active:scale-95 disabled:opacity-50"
                >
                  {t("trade.protection.clear")}
                </button>
              </Popconfirm>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-fg-3 hover:text-fg-2 h-8 px-2 text-[11.5px] font-semibold"
              >
                {t("common.none")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="border-line text-fg-2 hover:border-brand/50 hover:text-fg self-start rounded-full border px-4 py-1.5 text-[11.5px] font-bold transition-all duration-300 active:scale-95"
          >
            {t("trade.protection.title")}
          </button>
        )}

        {arm.error ? (
          <Alert
            type="error"
            showIcon
            message={arm.error.message}
            className="text-[11px]"
          />
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-fg-3 truncate text-[10px]">{label}</span>
      <span
        className="num text-fg truncate text-[12px] font-bold tabular-nums"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </span>
    </span>
  );
}
