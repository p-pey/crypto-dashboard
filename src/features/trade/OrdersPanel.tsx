"use client";

import { Tabs, Tooltip } from "antd";
import { venueColor, venueLabel } from "~/features/trading/venueMeta";
import { formatTime } from "~/i18n/format";
import type { Locale } from "~/i18n/config";
import { useI18n } from "~/i18n/I18nProvider";
import type { TranslationKey } from "~/i18n/dictionaries/types";
import type { ExchangeId, OrderStatus } from "~/services/trading/trading.types";
import { api } from "~/trpc/react";

/** Resting orders are polled; there is no private websocket on these venues. */
const POLL_MS = 15_000;

/**
 * Status colour, kept as a real token rather than an antd colour name.
 *
 * antd's `blue`/`green` are theme-independent hues that do not follow this app's
 * palette, and on the dark and glass themes they read as a different set of
 * colours from the rest of the screen. The CSS variables are what the rest of the
 * table uses, so the statuses are painted in the same language.
 */
const STATUS_TONE: Record<OrderStatus, string> = {
  open: "var(--text-2)",
  partially_filled: "var(--amber)",
  filled: "var(--mint)",
  canceled: "var(--text-3)",
  rejected: "var(--rose)",
  expired: "var(--text-3)",
};

/** The status word, looked up with its key narrowed to the dictionary type. */
const STATUS_KEY = {
  open: "trading.status.open",
  partially_filled: "trading.status.partially_filled",
  filled: "trading.status.filled",
  canceled: "trading.status.canceled",
  rejected: "trading.status.rejected",
  expired: "trading.status.expired",
} as const satisfies Record<OrderStatus, TranslationKey>;

/**
 * Resting orders and order history, side by side.
 *
 * Both are read from the exchange rather than from a local table, which is what
 * the operator asked for and also means an unreachable venue shows as an empty
 * tab rather than as a stale copy of what it held an hour ago.
 *
 * Cancelling is one click with no confirmation. A resting limit order is
 * reversible by definition - it has not traded - and a confirm dialog on it would
 * be friction on the one action the operator takes most often when a position has
 * moved away from them.
 */
export default function OrdersPanel({
  secret,
  onChanged,
}: {
  secret: string;
  onChanged: () => void;
}) {
  const { locale, t } = useI18n();

  const open = api.trading.openOrders.useQuery(
    { secret },
    { refetchInterval: POLL_MS },
  );
  const history = api.trading.orderHistory.useQuery(
    { secret, limit: 50 },
    { refetchInterval: POLL_MS },
  );

  const cancel = api.trading.cancelOrder.useMutation({ onSuccess: onChanged });

  return (
    <div className="border-line bg-surface-2/30 min-h-[420px] rounded-[14px] border p-3">
      <Tabs
        size="small"
        items={[
          {
            key: "open",
            label: `${t("trade.order.open")} (${(open.data ?? []).length})`,
            children: (
              <Table
                rows={open.data ?? []}
                loading={open.isLoading}
                empty={t("trade.order.none")}
                cancellable
                onCancel={(row) =>
                  cancel.mutate({
                    secret,
                    exchange: row.exchange,
                    id: row.id,
                    symbol: row.symbol,
                    clientOrderId: row.clientOrderId,
                  })
                }
                cancelPending={cancel.isPending}
                locale={locale}
              />
            ),
          },
          {
            key: "history",
            label: t("trade.order.history"),
            children: (
              <Table
                rows={history.data ?? []}
                loading={history.isLoading}
                empty={t("trade.order.historyEmpty")}
                locale={locale}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

type Row = {
  id: string;
  exchange: ExchangeId;
  symbol: string;
  side: "buy" | "sell";
  price: string;
  amount: string;
  filledAmount: string;
  averagePrice: string | null;
  status: OrderStatus;
  createdAt: number;
  clientOrderId: string | null;
};

function StatusPill({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  return (
    <span
      className="text-[10px] font-semibold whitespace-nowrap"
      style={{ color: STATUS_TONE[status] }}
    >
      {t(STATUS_KEY[status])}
    </span>
  );
}

function Table({
  rows,
  loading,
  empty,
  locale,
  cancellable = false,
  cancelPending = false,
  onCancel,
}: {
  rows: Row[];
  loading: boolean;
  empty: string;
  locale: Locale;
  cancellable?: boolean;
  cancelPending?: boolean;
  onCancel?: (row: Row) => void;
}) {
  const { t } = useI18n();

  if (rows.length === 0) {
    return (
      <p className="text-fg-3 border-line rounded-[12px] border border-dashed px-4 py-8 text-center text-[11.5px]">
        {loading ? t("common.loading") : empty}
      </p>
    );
  }

  return (
    <div className="max-h-[380px] overflow-y-auto">
      {rows.map((row) => (
        <div
          key={`${row.exchange}-${row.id}`}
          className="border-line/50 grid grid-cols-[1fr_auto] items-center gap-2 border-b py-2 md:grid-cols-[92px_88px_74px_108px_96px_62px_auto]"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: venueColor(row.exchange) }}
            />
            <span className="text-fg-2 truncate text-[11px] font-semibold">
              {venueLabel(row.exchange)}
            </span>
            <span className="mono text-fg-3 truncate text-[9.5px]">
              {row.symbol}
            </span>
          </span>

          <span
            className="text-[11px] font-bold"
            style={{ color: row.side === "buy" ? "var(--up)" : "var(--down)" }}
          >
            {row.side === "buy"
              ? t("trading.action.buy")
              : t("trading.action.sell")}
          </span>

          <StatusPill status={row.status} />

          <span className="num text-fg text-[11px] tabular-nums">
            {row.price}
          </span>

          <span className="num text-fg-2 text-[11px] tabular-nums">
            {row.filledAmount !== "0"
              ? `${row.filledAmount} / ${row.amount}`
              : row.amount}
          </span>

          <Tooltip title={formatTime(locale, row.createdAt)}>
            <span className="text-fg-3 text-[9.5px]">
              {formatTime(locale, row.createdAt).slice(-5)}
            </span>
          </Tooltip>

          {cancellable && onCancel ? (
            <button
              type="button"
              disabled={cancelPending}
              onClick={() => onCancel(row)}
              className="border-line text-fg-2 hover:border-rose/60 hover:text-rose rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold transition-all duration-200 active:scale-95 disabled:opacity-50"
            >
              {t("trading.orders.cancel")}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
