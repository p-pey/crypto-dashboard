"use client";

import { Alert, Input, Segmented, Select, Tag } from "antd";
import { useMemo, useState } from "react";
import { formatNumber } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type {
  MarketSpec,
  OrderKind,
  OrderSide,
} from "~/services/trading/trading.types";
import { api } from "~/trpc/react";
import type { MarketChoice } from "./MarketSidebar";

/**
 * The order form.
 *
 * Carries the same rule as everywhere else in this app: **the price is not an
 * input.** It is shown, large, and locked. A price field invites an edit, and an
 * edit silently breaks the one guarantee the operator asked for - that the order
 * rests at the number they clicked.
 *
 * What *is* editable is the size, and it is expressed in base units so it always
 * means the same thing. The venue's own unit and the resulting notional are shown
 * underneath, because three of the four Iranian venues quote their Rial markets
 * in Toman and the operator should see that conversion rather than trust it.
 */
type Props = {
  market: MarketChoice | null;
  spec: MarketSpec | null;
  secret: string;
  onPlaced: () => void;
};

export default function OrderForm({ market, spec, secret, onPlaced }: Props) {
  const { locale, t } = useI18n();
  const [side, setSide] = useState<OrderSide>("buy");
  const [amount, setAmount] = useState("");
  const [leverage, setLeverage] = useState("1");

  const place = api.trading.placeOrder.useMutation({
    onSuccess: () => {
      setAmount("");
      onPlaced();
    },
  });

  /**
   * The price the order will rest at, read from the board feed.
   *
   * Derived rather than stored. An earlier version copied it into state with an
   * effect, which meant the form briefly showed the *previous* market's price
   * after a switch and briefly showed a stale side's price after flipping
   * buy/sell. Deriving it means there is no frame in which the two can disagree.
   *
   * A REST snapshot rather than the live socket, because this is a price
   * *commitment*, not a price display: a number that moves while it is being read
   * is worse than one that is a few seconds old.
   */
  const prices = api.iran.getTickers.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: 30_000,
  });

  const priceInRial = useMemo(() => {
    if (!market) return 0;
    const ticker = prices.data?.tickers.find(
      (row) =>
        row.exchange === market.exchange && row.asset === market.instrumentId,
    );
    // The buy rests at the ask and the sell at the bid, which is what each
    // button actually costs. Using one price for both would advertise a buy
    // below the market.
    const price = side === "buy" ? ticker?.bestAsk : ticker?.bestBid;
    return price ?? 0;
  }, [market, prices.data, side]);

  const kind: OrderKind =
    market?.kind === "futures"
      ? "futures"
      : market?.kind === "margin"
        ? "margin"
        : "spot";

  const preview = api.trading.preview.useQuery(
    {
      exchange: market?.exchange ?? "nobitex",
      instrumentId: market?.instrumentId ?? "usdt",
      side,
      priceInRial: String(priceInRial || 0),
      amount: amount || "0",
    },
    { enabled: Boolean(market) && amount.length > 0 && priceInRial > 0 },
  );

  const blocked = useMemo(() => {
    if (!market) return t("trade.market.select");
    if (amount.length === 0) return t("trade.order.amount");
    if (priceInRial <= 0) return t("common.loading");
    if (preview.data && !preview.data.meetsMinimum)
      return t("trade.order.submit");
    return null;
  }, [amount, market, preview.data, priceInRial, t]);

  if (!market || !spec) {
    return (
      <div className="border-line text-fg-3 grid place-items-center rounded-[14px] border border-dashed px-6 py-12 text-[12.5px]">
        {t("trade.market.select")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="border-line bg-surface-2/60 rounded-[12px] border px-4 py-3">
        <p className="text-fg-3 text-[10px] font-semibold tracking-[0.12em] uppercase">
          {t("trade.order.price")}
        </p>
        <p className="num text-fg mt-1 text-[24px] leading-none font-extrabold tabular-nums">
          {formatNumber(locale, priceInRial, { maximumFractionDigits: 0 })}
        </p>
        {preview.data ? (
          <p className="text-fg-3 mt-1.5 text-[10.5px]">
            {t("trading.ticket.atVenue")}{" "}
            <span className="mono text-fg-2">
              {preview.data.priceAtVenue}
              {preview.data.priceAtVenue !== String(priceInRial) ? (
                <span className="ms-1.5">{t("trading.ticket.adjusted")}</span>
              ) : null}
            </span>
          </p>
        ) : null}
      </div>

      <Segmented
        block
        value={side}
        onChange={(value) => setSide(value as OrderSide)}
        options={[
          {
            value: "buy",
            label: (
              <span style={{ color: "var(--up)", fontWeight: 700 }}>
                {t("trading.action.buy")}
              </span>
            ),
          },
          {
            value: "sell",
            label: (
              <span style={{ color: "var(--down)", fontWeight: 700 }}>
                {t("trading.action.sell")}
              </span>
            ),
          },
        ]}
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-fg-2 text-[11px] font-semibold">
          {t("trade.order.amount", market.instrumentId.toUpperCase())}
        </label>
        {/* A text input, not antd's InputNumber: the numeric control normalises
            through a JS number, and 0.00001 of a coin does not survive that. */}
        <Input
          size="large"
          value={amount}
          onChange={(event) => setAmount(event.target.value.trim())}
          inputMode="decimal"
          placeholder="0.00"
        />
        <p className="text-fg-3 text-[10.5px]">
          {t("trade.order.amountHint", market.instrumentId.toUpperCase())}
        </p>
      </div>

      {kind !== "spot" ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-fg-2 text-[11px] font-semibold">
            {t("trade.futures.leverage")}
          </label>
          <Select
            value={leverage}
            onChange={setLeverage}
            options={["1", "2", "3", "5", "10"].map((value) => ({
              value,
              label: `${value}x`,
            }))}
          />
          <p className="text-fg-3 text-[10.5px]">
            {t("trade.futures.leverageHint")}
          </p>
        </div>
      ) : null}

      {preview.data && !preview.data.meetsMinimum ? (
        <Alert
          type="error"
          showIcon
          message={t("trading.ticket.belowMinimum").replace(
            "%s",
            preview.data.minNotional ?? "",
          )}
        />
      ) : null}

      {place.error ? (
        <Alert
          type="error"
          showIcon
          message={t("trading.ticket.rejected")}
          description={place.error.message}
        />
      ) : null}

      <button
        type="button"
        disabled={blocked !== null || place.isPending}
        onClick={() =>
          place.mutate({
            secret,
            exchange: market.exchange,
            instrumentId: market.instrumentId,
            side,
            priceInRial: String(priceInRial),
            amount,
            kind,
            ...(kind === "spot" ? {} : { leverage }),
          })
        }
        className="text-fg-1 from-brand to-brand-2 h-11 rounded-[12px] bg-gradient-to-br text-[13px] font-bold transition-all duration-300 active:scale-[0.99] disabled:opacity-50"
        style={
          side === "sell"
            ? {
                backgroundImage:
                  "linear-gradient(135deg, var(--down), var(--rose))",
              }
            : undefined
        }
      >
        {place.isPending
          ? t("trade.order.submitting")
          : t("trade.order.submit")}
      </button>

      <div className="border-line flex flex-wrap items-center gap-1.5 border-t pt-2.5">
        <Tag>{market.instrumentId.toUpperCase()}</Tag>
        <Tag
          color={
            kind === "futures" ? "purple" : kind === "margin" ? "gold" : "blue"
          }
        >
          {kind === "futures"
            ? t("trade.kind.futures")
            : kind === "margin"
              ? t("trade.kind.margin")
              : t("trade.kind.spot")}
        </Tag>
        <span className="mono text-fg-3 text-[10px]">{spec.symbol}</span>
      </div>

      <p className="text-fg-3 text-[10.5px] leading-relaxed">
        {blocked ?? t("trade.order.restingHint")}
      </p>
    </div>
  );
}
