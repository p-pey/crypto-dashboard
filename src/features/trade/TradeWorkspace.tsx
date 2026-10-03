"use client";

import { Alert, Input, Segmented } from "antd";
import { motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { useI18n } from "~/i18n/I18nProvider";
import { useTradingSecret } from "~/features/trading/useTradingSecret";
import { leverageMode } from "~/constants/tradingInstruments";
import type { OrderKind } from "~/services/trading/trading.types";
import { api } from "~/trpc/react";
import MarketSidebar, { type MarketChoice } from "./MarketSidebar";
import OrderForm from "./OrderForm";
import PositionCard from "./PositionCard";
import OrdersPanel from "./OrdersPanel";
import BalancesStrip from "./BalancesStrip";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Positions and balances move on their own cadence, not on the tick. */
const POLL_MS = 20_000;

/**
 * The spot and futures trading workspace.
 *
 * Laid out the way an exchange lays out a market - instruments on the left, the
 * order form beside them, positions and orders below - because that arrangement
 * answers the three questions in the order they get asked: what am I trading,
 * what do I want to do, and what do I already have on.
 *
 * **Every surface requires the trading secret.** This app has no sign-in, and a
 * trading screen that renders balances without a check would expose them to anyone
 * who could load the page. Locked, it says why instead of showing a dead form.
 */
export default function TradeWorkspace() {
  const { t } = useI18n();
  const { secret, setSecret, hasSecret, clear } = useTradingSecret();
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"spot" | "futures">("spot");
  const [market, setMarket] = useState<MarketChoice | null>(null);

  const status = api.trading.status.useQuery();
  const markets = api.trading.markets.useQuery(undefined, {
    staleTime: 300_000,
  });

  const utils = api.useUtils();
  const refresh = useCallback(() => {
    void utils.trading.openOrders.invalidate();
    void utils.trading.balances.invalidate();
    void utils.trading.orderHistory.invalidate();
    void utils.trading.futuresPositions.invalidate();
  }, [utils]);

  const balances = api.trading.balances.useQuery(
    { secret },
    { enabled: hasSecret, refetchInterval: POLL_MS },
  );
  const positions = api.trading.futuresPositions.useQuery(
    { secret },
    { enabled: hasSecret, refetchInterval: POLL_MS },
  );

  /*
   * The market list for the current tab.
   *
   * Spot shows every venue that lists the instrument. Futures shows only the
   * pairs that are actually traded with leverage, and marks which product they
   * use - because the answer is not uniform: Tabdeal runs perpetuals on its
   * gold, Nobitex runs margin on its Rial gold, Wallex's margin lists no gold at
   * all, and Bitpin has no leverage product to select from. Offering a futures
   * row for an instrument no venue trades leveraged would put a real order form
   * in front of a dead end.
   */
  const choices = useMemo<MarketChoice[]>(() => {
    const rows: MarketChoice[] = [];

    for (const spec of markets.data ?? []) {
      if (!spec.tradable) continue;

      if (mode === "spot") {
        rows.push({
          exchange: spec.exchange,
          instrumentId: spec.instrumentId,
          symbol: spec.symbol,
          kind: "spot",
          maxLeverage: null,
        });
        continue;
      }

      const product = leverageMode(spec.exchange, spec.instrumentId);
      if (product === null) continue;
      rows.push({
        exchange: spec.exchange,
        instrumentId: spec.instrumentId,
        symbol: spec.symbol,
        kind: product,
        maxLeverage: null,
      });
    }

    return rows;
  }, [markets.data, mode]);

  const spec = useMemo(
    () =>
      (markets.data ?? []).find(
        (entry) =>
          entry.exchange === market?.exchange &&
          entry.instrumentId === market.instrumentId,
      ) ?? null,
    [market, markets.data],
  );

  const kind: OrderKind =
    market?.kind === "futures"
      ? "futures"
      : market?.kind === "margin"
        ? "margin"
        : "spot";

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="flex flex-col gap-3"
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className="text-fg text-[15px] font-bold tracking-tight">
            {t("trade.title")}
          </h2>
          <p className="text-fg-3 mt-0.5 text-[11.5px] leading-relaxed">
            {t("trade.description")}
          </p>
        </div>
        {status.data ? (
          <span
            className="text-fg-3 text-[10.5px] font-semibold"
            title={
              status.data.mode === "paper"
                ? t("trading.mode.paperHint")
                : t("trading.mode.liveHint")
            }
          >
            {status.data.mode === "live"
              ? t("trading.mode.live")
              : t("trading.mode.paper")}
          </span>
        ) : null}
      </header>

      {status.data?.mode === "paper" ? (
        <Alert
          type="info"
          showIcon
          message={t("trading.mode.paper")}
          description={t("trading.mode.paperHint")}
        />
      ) : null}

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
            <div className="flex max-w-md gap-2">
              <Input.Password
                size="small"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="TRADING_API_SECRET"
              />
              <button
                type="button"
                disabled={draft.length === 0}
                onClick={() => {
                  setSecret(draft);
                  setDraft("");
                }}
                className="from-brand to-brand-2 text-fg-1 shrink-0 rounded-full bg-gradient-to-br px-4 text-[11.5px] font-bold disabled:opacity-50"
              >
                {t("trading.access.ready")}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={mode}
              onChange={(value) => setMode(value as "spot" | "futures")}
              options={[
                { value: "spot", label: t("trade.tab.spot") },
                { value: "futures", label: t("trade.tab.futures") },
              ]}
            />
            <button
              type="button"
              onClick={clear}
              className="text-fg-3 hover:text-fg-2 ms-auto text-[10.5px] font-semibold"
            >
              {t("trade.order.cancelAll")}
            </button>
          </div>

          <BalancesStrip
            rows={balances.data ?? []}
            loading={balances.isLoading}
          />

          {mode === "futures" ? (
            <div className="flex flex-col gap-2">
              {(positions.data ?? []).map((position) => (
                <PositionCard
                  key={`${position.exchange}-${position.id}`}
                  position={position}
                  secret={secret}
                  onChanged={refresh}
                />
              ))}
              {(positions.data ?? []).length === 0 ? (
                <p className="border-line text-fg-3 rounded-[12px] border border-dashed px-4 py-6 text-center text-[12px]">
                  {positions.isLoading
                    ? t("common.loading")
                    : t("trade.futures.noPositions")}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_minmax(0,340px)_minmax(0,1fr)]">
            <div className="lg:h-[560px]">
              <MarketSidebar
                choices={choices}
                selected={market}
                onSelect={setMarket}
                loading={markets.isLoading}
              />
            </div>

            <div className="border-line bg-surface-2/30 rounded-[14px] border p-3">
              {/* Keyed on the market so switching remounts the form rather than
                  resetting it, which is what keeps a stale amount or a stale
                  mutation error from surviving the switch. */}
              <OrderForm
                key={`${market?.exchange}-${market?.instrumentId}-${kind}`}
                market={market}
                spec={spec}
                secret={secret}
                onPlaced={refresh}
              />
            </div>

            <OrdersPanel secret={secret} onChanged={refresh} />
          </div>
        </>
      )}
    </motion.section>
  );
}
