"use client";

import { Alert, Input, Modal, Segmented, Select, Tag } from "antd";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { formatNumber } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type { ExchangeId } from "~/services/trading/trading.types";
import { api } from "~/trpc/react";
import { venueColor, venueLabel } from "./venueMeta";

const EASE = [0.16, 1, 0.3, 1] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  /** Stable id from the trading catalogue, e.g. `xaut`. */
  instrumentId: string;
  side: "buy" | "sell";
  /** The exact price clicked on the board, in Rial. */
  priceInRial: number;
  /** Venues that list this instrument, from the market metadata. */
  venues: { exchange: ExchangeId; symbol: string }[];
  defaultVenue: ExchangeId;
  secret: string;
  onPlaced: () => void;
};

/**
 * The order ticket.
 *
 * Built around one promise: **the order rests at the number on the board.**
 * The price is shown large and is not an input, because a price field invites
 * an edit that would quietly break that guarantee. What the operator *can* set
 * is the size, and the size is expressed in the base instrument so it always
 * means the same thing.
 *
 * The second thing this screen exists for is the unit conversion. Three of the
 * four Iranian venues quote their Rial markets in Toman, so the Rial price on
 * the board is a tenth of the number that goes on the wire. That is a
 * factor-of-ten, not a rounding difference, so it is stated in plain words on
 * the ticket rather than being handled silently.
 */
export default function TradeTicketModal({
  open,
  onClose,
  instrumentId,
  side: initialSide,
  priceInRial,
  venues,
  defaultVenue,
  secret,
  onPlaced,
}: Props) {
  const { locale, t } = useI18n();
  // Seeded from props rather than reset in an effect: the caller unmounts this
  // when the ticket closes, so a fresh mount already starts from the values
  // for the row that was just clicked.
  const [side, setSide] = useState(initialSide);
  const [venue, setVenue] = useState<ExchangeId>(defaultVenue);
  const [amount, setAmount] = useState<string>("");
  const [placed, setPlaced] = useState<{ id: string; status: string } | null>(
    null,
  );

  const utils = api.useUtils();
  const place = api.trading.placeOrder.useMutation();

  /**
   * What the venue will actually receive.
   *
   * Recomputed as the operator types rather than only on submit, so the Toman
   * figure and the minimum-order check are visible while there is still time to
   * change the size.
   */
  const preview = api.trading.preview.useQuery(
    {
      exchange: venue,
      instrumentId,
      side,
      priceInRial: String(priceInRial),
      amount: amount || "0",
    },
    { enabled: open && amount.length > 0 },
  );

  const symbol = useMemo(
    () => venues.find((row) => row.exchange === venue)?.symbol ?? "",
    [venue, venues],
  );

  const notionalRial = preview.data?.notionalInRial ?? null;
  const priceAsSeen = preview.data
    ? formatNumber(locale, Number(preview.data.priceInRial), {
        maximumFractionDigits: 0,
      })
    : formatNumber(locale, priceInRial, { maximumFractionDigits: 0 });

  const submit = async () => {
    if (!amount) return;
    const order = await place.mutateAsync({
      secret,
      exchange: venue,
      instrumentId,
      side,
      priceInRial: String(priceInRial),
      amount,
    });
    setPlaced({ id: order.id, status: order.status });
    onPlaced();
    // Everything downstream - balances, resting orders, history - changes on a
    // successful place, so all of it is refetched together.
    await Promise.all([
      utils.trading.openOrders.invalidate(),
      utils.trading.balances.invalidate(),
      utils.trading.orderHistory.invalidate(),
    ]);
  };

  const disabled =
    !amount ||
    preview.isLoading ||
    (preview.data ? !preview.data.meetsMinimum : false) ||
    place.isPending;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={460}
      destroyOnHidden
      title={
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold">
            {t("trading.ticket.title")}
          </span>
          <Tag color="blue">{t("trading.ticket.subtitle")}</Tag>
        </div>
      }
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="flex flex-col gap-3 pt-1"
      >
        {placed ? (
          <Alert
            type={placed.status === "filled" ? "success" : "info"}
            showIcon
            message={
              placed.status === "filled"
                ? t("trading.ticket.filled")
                : t("trading.ticket.placed")
            }
            description={<span className="mono text-[11px]">{placed.id}</span>}
          />
        ) : null}

        {/* The price, deliberately not editable. */}
        <div className="border-line bg-surface-2/60 rounded-[12px] border px-4 py-3">
          <p className="text-fg-3 text-[10px] font-semibold tracking-[0.12em] uppercase">
            {t("trading.ticket.priceHint")}
          </p>
          <p className="num text-fg mt-1 text-[26px] leading-none font-extrabold tabular-nums">
            {priceAsSeen}
            <span className="text-fg-3 ms-1.5 text-[12px] font-semibold">
              {t("nerkh.units.rial")}
            </span>
          </p>

          {preview.data ? (
            <div className="border-line mt-2.5 border-t pt-2">
              <Row
                label={t("trading.ticket.atVenue")}
                value={
                  <span className="mono">
                    {preview.data.priceAtVenue}
                    {preview.data.priceAtVenue !== priceAsSeen ? (
                      <span className="ms-1.5 text-[10px] opacity-70">
                        {t("trading.ticket.adjusted")}
                      </span>
                    ) : null}
                  </span>
                }
              />
              <Row
                label={t("trading.ticket.rialValue")}
                value={
                  <span className="mono">
                    {notionalRial && amount
                      ? `${formatNumber(locale, Number(notionalRial), {
                          maximumFractionDigits: 0,
                        })} ${t("nerkh.units.rial")}`
                      : "—"}
                  </span>
                }
              />
            </div>
          ) : null}
        </div>

        <Segmented
          block
          value={side}
          onChange={(value) => setSide(value as "buy" | "sell")}
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
            {t("trading.ticket.amountHint").replace(
              "%s",
              instrumentId.toUpperCase(),
            )}
          </label>
          {/*
            A text input rather than antd's `InputNumber`, on purpose.
            `InputNumber` is a numeric control: even in string mode it normalises
            through a JavaScript number, and a 0.00001 XAUT size is exactly the
            kind of value that does not survive that. Keeping the raw string
            here means the only thing that ever parses it is the fixed-point
            decimal layer, which is exact.
          */}
          <Input
            size="large"
            value={amount}
            onChange={(event) => setAmount(event.target.value.trim())}
            inputMode="decimal"
            placeholder="0.00"
            // Digits, one separator, nothing else: the value never leaves this
            // shape, so the parser cannot be handed something it must guess at.
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (/^\d*(\.\d*)?$/.test(text.trim())) {
                event.preventDefault();
                setAmount(text.trim());
              }
            }}
          />
          <p className="text-fg-3 text-[10.5px]">
            {t("trading.ticket.amountHint").replace(
              "%s",
              instrumentId.toUpperCase(),
            )}
          </p>
        </div>

        {/*
          Only shown when more than one venue lists the instrument. Gold sits on
          all four Iranian exchanges at meaningfully different prices, so
          choosing the venue is part of the trade rather than an afterthought -
          and the price the order rests at follows the selection.
        */}
        {venues.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-fg-2 text-[11px] font-semibold">
              {t("trading.ticket.venue")}
            </label>
            <Select
              value={venue}
              onChange={setVenue}
              size="large"
              options={venues.map((row) => ({
                value: row.exchange,
                label: (
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-1.5 rounded-full"
                      style={{ background: venueColor(row.exchange) }}
                    />
                    {venueLabel(row.exchange)}
                  </span>
                ),
              }))}
            />
          </div>
        ) : (
          <Row label={t("trading.ticket.venue")} value={venue} />
        )}

        <div className="border-line bg-surface-2/40 flex flex-col gap-1 rounded-[12px] border px-3 py-2.5">
          <Row
            label={t("trading.ticket.instrument")}
            value={<span className="mono">{symbol}</span>}
          />
          <Row
            label={t("trading.ticket.tick")}
            value={
              <span className="mono">{preview.data?.tickSize ?? "—"}</span>
            }
          />
          <Row
            label={t("trading.ticket.step")}
            value={
              <span className="mono">{preview.data?.stepSize ?? "—"}</span>
            }
          />
        </div>

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
          onClick={submit}
          disabled={disabled || Boolean(placed)}
          className="text-fg-1 from-brand to-brand-2 mt-1 h-11 rounded-[12px] bg-gradient-to-br text-[13px] font-bold transition-all duration-300 active:scale-[0.99] disabled:opacity-50"
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
            ? t("trading.ticket.submitting")
            : t("trading.ticket.confirmResting")}
        </button>

        <p className="text-fg-3 text-[10.5px] leading-relaxed">
          {t("trading.ticket.confirmRestingHint")}
        </p>
      </motion.div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11.5px]">
      <span className="text-fg-3">{label}</span>
      <span className="text-fg-2 font-semibold">{value}</span>
    </div>
  );
}
