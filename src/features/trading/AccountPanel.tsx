"use client";

import { Alert, Button, Input, Tabs, Tag, Tooltip } from "antd";
import { motion } from "motion/react";
import { useState } from "react";
import { formatNumber, formatTime } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { venueColor, venueLabel } from "./venueMeta";
import { api } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Resting orders are polled; the socket layer does not cover private data. */
const POLL_MS = 15_000;

const STATUS_COLOR: Record<string, string> = {
  open: "blue",
  partially_filled: "gold",
  filled: "green",
  canceled: "default",
  rejected: "red",
  expired: "default",
};

/**
 * The operator's own account: holdings, resting orders, history and positions.
 *
 * Everything here is read from the exchange rather than from a local table,
 * because the exchange is the record. That also means an unreachable venue
 * shows as an empty section rather than as a zero balance - a wrong number on a
 * trading screen is worse than a missing one.
 */
export default function AccountPanel({
  secret,
  hasSecret,
  onSecret,
}: {
  secret: string;
  hasSecret: boolean;
  onSecret: (value: string) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"open" | "history" | "positions">("open");

  const sessions = api.trading.sessions.useQuery(undefined, {
    refetchInterval: 120_000,
  });

  const status = api.trading.status.useQuery();
  const balances = api.trading.balances.useQuery(
    { secret },
    { enabled: hasSecret, refetchInterval: POLL_MS },
  );
  const openOrders = api.trading.openOrders.useQuery(
    { secret },
    { enabled: hasSecret, refetchInterval: POLL_MS },
  );
  const history = api.trading.orderHistory.useQuery(
    { secret, limit: 60 },
    { enabled: hasSecret, refetchInterval: POLL_MS },
  );
  const positions = api.trading.positions.useQuery(
    { secret },
    { enabled: hasSecret, refetchInterval: POLL_MS },
  );

  const cancel = api.trading.cancelOrder.useMutation({
    onSuccess: () => {
      void openOrders.refetch();
      void balances.refetch();
      void history.refetch();
    },
  });

  const seed = api.trading.seedPaperAccount.useMutation({
    onSuccess: () => void balances.refetch(),
  });

  const readyVenues = (sessions.data ?? []).filter((row) => row.ready);

  /**
   * Seeds a paper account with one unit of the quote asset and a little gold.
   *
   * The smallest useful numbers rather than a realistic-looking balance: a
   * paper run only tells the operator something about execution and fees if the
   * quantities are small enough to reason about, and the venue minimums are what
   * actually constrain the first order.
   */
  const seedPaper = () =>
    seed.mutateAsync({
      secret,
      exchange: "nobitex",
      holdings: [
        { asset: "RLS", amount: "5000000000" },
        { asset: "USDT", amount: "500" },
        { asset: "XAUT", amount: "1" },
        { asset: "PAXG", amount: "1" },
      ],
    });

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="panel px-4 py-4"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-fg text-[14px] font-bold">{t("trading.title")}</h3>

        <div className="flex items-center gap-2">
          {status.data ? (
            <Tag color={status.data.mode === "live" ? "red" : "cyan"}>
              {status.data.mode === "live"
                ? t("trading.mode.live")
                : t("trading.mode.paper")}
            </Tag>
          ) : null}
          {status.data?.telegramConfigured ? (
            <Tooltip title={t("trading.notify.configured")}>
              <Tag color="green">{t("trading.notify.title")}</Tag>
            </Tooltip>
          ) : (
            <Tooltip title={t("trading.notify.notConfigured")}>
              <Tag>{t("trading.notify.title")}</Tag>
            </Tooltip>
          )}
        </div>
      </header>

      {status.data?.mode === "paper" ? (
        <Alert
          type="info"
          showIcon
          className="mb-3"
          message={t("trading.mode.paper")}
          description={t("trading.mode.paperHint")}
        />
      ) : null}

      {/* Venue readiness, so a missing key is explained rather than silent. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(sessions.data ?? []).map((venue) => (
          <Tooltip key={venue.exchange} title={venue.note ?? undefined}>
            <Tag
              color={venue.ready ? "green" : "default"}
              style={{ borderColor: venueColor(venue.exchange) }}
            >
              {venue.label}
              <span className="ms-1 opacity-70">
                {venueKind(t, venue.kind)}
              </span>
            </Tag>
          </Tooltip>
        ))}
      </div>

      {!hasSecret ? (
        <div className="border-line bg-surface-2/50 flex flex-col gap-2 rounded-[12px] border px-4 py-4">
          <p className="text-fg text-[12.5px] font-bold">
            {status.data?.requiresSecret
              ? t("trading.access.locked")
              : t("trading.access.noCredentials")}
          </p>
          <p className="text-fg-3 text-[11.5px] leading-relaxed">
            {status.data?.requiresSecret
              ? t("trading.access.lockedHint")
              : t("trading.access.noCredentialsHint")}
          </p>
          {status.data?.requiresSecret ? (
            <div className="flex gap-2">
              <Input.Password
                size="small"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="TRADING_API_SECRET"
              />
              <Button
                size="small"
                type="primary"
                disabled={draft.length === 0}
                onClick={() => {
                  onSecret(draft);
                  setDraft("");
                }}
              >
                {t("trading.access.ready")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <Holdings rows={balances.data ?? []} loading={balances.isLoading} />

          <Tabs
            className="mt-3"
            activeKey={tab}
            onChange={(key) => setTab(key as typeof tab)}
            items={[
              {
                key: "open",
                label: `${t("trading.orders.open")} (${(openOrders.data ?? []).length})`,
                children: (
                  <OrderTable
                    rows={openOrders.data ?? []}
                    loading={openOrders.isLoading}
                    empty={t("trading.orders.empty")}
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
                  />
                ),
              },
              {
                key: "history",
                label: t("trading.orders.history"),
                children: (
                  <OrderTable
                    rows={history.data ?? []}
                    loading={history.isLoading}
                    empty={t("trading.orders.empty")}
                  />
                ),
              },
              {
                key: "positions",
                label: t("trading.orders.positions"),
                children: (
                  <PositionTable
                    rows={positions.data ?? []}
                    loading={positions.isLoading}
                    empty={t("trading.orders.empty")}
                  />
                ),
              },
            ]}
          />
        </>
      )}

      {status.data?.mode === "paper" && hasSecret ? (
        <div className="border-line mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border px-3 py-2.5">
          <p className="text-fg-3 text-[11px]">
            {(balances.data ?? []).length === 0
              ? t("trading.balances.empty")
              : t("trading.balances.title")}
          </p>
          <Button size="small" loading={seed.isPending} onClick={seedPaper}>
            {t("trading.mode.paper")} · 50,000 USDT
          </Button>
        </div>
      ) : null}

      {readyVenues.length === 0 && hasSecret ? (
        <Alert
          className="mt-3"
          type="warning"
          showIcon
          message={t("trading.access.noCredentials")}
          description={t("trading.access.noCredentialsHint")}
        />
      ) : null}
    </motion.section>
  );
}

function venueKind(t: ReturnType<typeof useI18n>["t"], kind: string): string {
  if (kind === "spot+futures") return t("trading.venue.futures");
  if (kind === "spot+margin") return t("trading.venue.margin");
  return t("trading.venue.spot");
}

function Holdings({
  rows,
  loading,
}: {
  rows: {
    exchange: string;
    asset: string;
    free: string;
    locked: string;
    total: string;
  }[];
  loading: boolean;
}) {
  const { locale, t } = useI18n();

  if (rows.length === 0) {
    return (
      <p className="text-fg-3 border-line rounded-[12px] border border-dashed px-4 py-5 text-center text-[12px]">
        {loading ? "…" : t("trading.balances.empty")}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
      {rows.map((row) => (
        <div
          key={`${row.exchange}-${row.asset}`}
          className="border-line bg-surface-2/60 rounded-[12px] border px-3 py-2.5"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-fg text-[13px] font-bold">{row.asset}</span>
            <span
              className="text-[10px] font-semibold"
              style={{ color: venueColor(row.exchange) }}
            >
              {venueLabel(row.exchange)}
            </span>
          </div>
          <p className="num text-fg mt-1 text-[15px] font-extrabold tabular-nums">
            {formatNumber(locale, Number(row.free), {
              maximumFractionDigits: 8,
            })}
          </p>
          <p className="text-fg-3 text-[10px]">
            {t("trading.balances.locked")}: {row.locked}
          </p>
        </div>
      ))}
    </div>
  );
}

function OrderTable({
  rows,
  loading,
  empty,
  cancellable = false,
  onCancel,
}: {
  rows: {
    id: string;
    exchange: string;
    side: "buy" | "sell";
    symbol: string;
    price: string;
    amount: string;
    filledAmount: string;
    averagePrice: string | null;
    status: string;
    createdAt: number;
  }[];
  loading: boolean;
  empty: string;
  cancellable?: boolean;
  onCancel?: (row: {
    exchange: "nobitex";
    id: string;
    symbol: string;
    clientOrderId: string | null;
  }) => void;
}) {
  const { locale, t } = useI18n();

  if (rows.length === 0) {
    return (
      <p className="text-fg-3 border-line rounded-[12px] border border-dashed px-4 py-5 text-center text-[12px]">
        {loading ? "…" : empty}
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {rows.map((row) => (
        <div
          key={`${row.exchange}-${row.id}`}
          className="border-line/60 grid grid-cols-[1fr_auto] items-center gap-3 border-b px-2 py-2 md:grid-cols-[90px_100px_70px_120px_120px_90px_auto]"
        >
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: venueColor(row.exchange) }}
            />
            <span className="text-fg-2 text-[11.5px] font-semibold">
              {venueLabel(row.exchange)}
            </span>
            <span className="mono text-fg-3 text-[10px]">{row.symbol}</span>
          </span>

          <span
            className="text-[11px] font-bold"
            style={{ color: row.side === "buy" ? "var(--up)" : "var(--down)" }}
          >
            {row.side === "buy"
              ? t("trading.action.buy")
              : t("trading.action.sell")}
          </span>

          <Tag color={STATUS_COLOR[row.status] ?? "default"} className="w-fit">
            {t(`trading.status.${row.status}` as never)}
          </Tag>

          <span className="num text-fg text-[11.5px] tabular-nums">
            {row.price}
          </span>
          <span className="num text-fg-2 text-[11.5px] tabular-nums">
            {row.filledAmount !== "0" ? `${row.filledAmount} / ` : ""}
            {row.amount}
          </span>
          <span className="text-fg-3 text-[10px]">
            {formatTime(locale, row.createdAt)}
          </span>

          {cancellable && onCancel ? (
            <Button size="small" danger onClick={() => onCancel(row as never)}>
              {t("trading.orders.cancel")}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PositionTable({
  rows,
  loading,
  empty,
}: {
  rows: {
    id: string;
    exchange: string;
    symbol: string;
    side: "long" | "short";
    size: string;
    entryPrice: string;
    leverage: string | null;
    unrealizedPnl: string | null;
    liquidationPrice: string | null;
  }[];
  loading: boolean;
  empty: string;
}) {
  const { t } = useI18n();

  if (rows.length === 0) {
    return (
      <p className="text-fg-3 border-line rounded-[12px] border border-dashed px-4 py-5 text-center text-[12px]">
        {loading ? "…" : empty}
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {rows.map((row) => (
        <div
          key={`${row.exchange}-${row.id}`}
          className="border-line/60 grid grid-cols-2 items-center gap-3 border-b px-2 py-2 md:grid-cols-[110px_80px_80px_110px_70px_120px_110px]"
        >
          <span className="mono text-fg-2 text-[11px]">{row.symbol}</span>
          <span
            className="text-[11px] font-bold"
            style={{ color: row.side === "long" ? "var(--up)" : "var(--down)" }}
          >
            {row.side}
          </span>
          <span className="num text-fg text-[11.5px] tabular-nums">
            {row.size}
          </span>
          <span className="num text-fg-2 text-[11.5px] tabular-nums">
            {row.entryPrice}
          </span>
          <span className="text-fg-3 text-[10.5px]">
            {row.leverage ? `${row.leverage}x` : "—"}
          </span>
          <span
            className="num text-[11.5px] font-bold tabular-nums"
            style={{
              color:
                row.unrealizedPnl && Number(row.unrealizedPnl) >= 0
                  ? "var(--up)"
                  : "var(--down)",
            }}
          >
            {row.unrealizedPnl ?? "—"}
          </span>
          <span className="text-fg-3 text-[10.5px]">
            {t("trading.orders.liquidation")}: {row.liquidationPrice ?? "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
