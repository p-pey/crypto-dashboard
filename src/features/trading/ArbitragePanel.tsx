"use client";

import { Alert, Tooltip } from "antd";
import { motion } from "motion/react";
import { useState } from "react";
import { formatNumber } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type { MarketRow } from "~/services/iran/iran.market.types";
import type { ExchangeId } from "~/services/trading/trading.types";
import { api } from "~/trpc/react";
import TradeTicketModal from "./TradeTicketModal";
import { venueColor, venueLabel } from "./venueMeta";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Cross-venue spreads, and the wizard to act on one.
 *
 * The panel leads with the **net** spread rather than the raw gap, because the
 * raw gap across two Iranian exchanges is usually an artefact of quote-unit and
 * timing differences rather than anything capturable. The net figure has both
 * taker fees and a transfer allowance taken out, and the "worth acting on" tag
 * is driven by it. Showing the raw number first is how a scanner talks someone
 * into a trade that loses money.
 *
 * Rows that do not clear costs are still listed, greyed, so the operator can see
 * that the comparison was made and why nothing was suggested.
 */
export default function ArbitragePanel({
  rows,
  secret,
  hasSecret,
  venuesFor,
}: {
  /** The board rows already on screen, so no extra exchange requests are made. */
  rows: MarketRow[];
  secret: string;
  hasSecret: boolean;
  venuesFor: (
    instrumentId: string,
  ) => { exchange: ExchangeId; symbol: string }[];
}) {
  const { t } = useI18n();
  const [ticket, setTicket] = useState<{
    instrumentId: string;
    side: "buy" | "sell";
    priceInRial: number;
    venue: ExchangeId;
  } | null>(null);

  const arbitrage = api.trading.arbitrage.useQuery({
    rows: rows.slice(0, 400),
  });
  const rules = api.trading.arbitrageRules.useQuery(
    { secret },
    { enabled: hasSecret },
  );
  const saveRule = api.trading.saveArbitrageRule.useMutation({
    onSuccess: () => void rules.refetch(),
  });

  const opportunities = arbitrage.data ?? [];
  const actionable = opportunities.filter((row) => row.actionable);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.06, ease: EASE }}
      className="panel px-4 py-4"
    >
      <header className="mb-1">
        <h3 className="text-fg text-[14px] font-bold">
          {t("trading.arbitrage.title")}
        </h3>
        <p className="text-fg-3 mt-0.5 max-w-3xl text-[11.5px] leading-relaxed">
          {t("trading.arbitrage.description")}
        </p>
      </header>

      {opportunities.length === 0 ? (
        <p className="text-fg-3 border-line mt-3 rounded-[12px] border border-dashed px-4 py-6 text-center text-[12px]">
          {arbitrage.isLoading ? "…" : t("trading.arbitrage.empty")}
        </p>
      ) : (
        <>
          {actionable.length > 0 ? (
            <Alert
              className="mt-3"
              type="success"
              showIcon
              message={`${actionable.length} × ${t("trading.arbitrage.actionable")}`}
            />
          ) : null}

          <div className="mt-3 flex flex-col">
            {opportunities.map((row) => (
              <div
                key={row.key}
                className="border-line/60 grid grid-cols-2 items-center gap-2 border-b py-2.5 md:grid-cols-[130px_1fr_1fr_80px_90px_80px_auto]"
                style={{ opacity: row.actionable ? 1 : 0.55 }}
              >
                <span className="flex flex-col">
                  <span className="text-fg text-[12.5px] font-bold">
                    {row.label}
                  </span>
                  <span className="mono text-fg-3 text-[10px]">
                    {row.instrumentId.toUpperCase()}
                  </span>
                </span>

                <Leg
                  label={t("trading.arbitrage.buyAt")}
                  exchange={row.buy.exchange}
                  price={row.buy.priceInRial}
                  live={row.buy.live}
                />
                <Leg
                  label={t("trading.arbitrage.sellAt")}
                  exchange={row.sell.exchange}
                  price={row.sell.priceInRial}
                  live={row.sell.live}
                />

                <Tooltip title={t("trading.arbitrage.gross")}>
                  <span className="num text-fg-3 text-right text-[11.5px] tabular-nums">
                    {row.grossSpreadPercent}%
                  </span>
                </Tooltip>

                <Tooltip
                  title={`${t("trading.arbitrage.costs")}: ${row.totalCostRial} ${t("nerkh.units.rial")}`}
                >
                  <span
                    className="num text-right text-[13px] font-extrabold tabular-nums"
                    style={{
                      color: row.actionable ? "var(--mint)" : "var(--text-3)",
                    }}
                  >
                    {row.netSpreadPercent}%
                  </span>
                </Tooltip>

                <Tooltip
                  title={t("trading.arbitrage.netProfit").replace(
                    "%s",
                    `${row.notionalRial} ${t("nerkh.units.rial")}`,
                  )}
                >
                  <span
                    className="num text-right text-[11.5px] font-semibold tabular-nums"
                    style={{
                      color: row.actionable ? "var(--mint)" : "var(--text-3)",
                    }}
                  >
                    {row.actionable ? row.netProfitRial : "—"}
                  </span>
                </Tooltip>

                <div className="flex items-center justify-end gap-1.5">
                  {hasSecret ? (
                    <AlertButton
                      exchange={row.buy.exchange}
                      instrumentId={row.instrumentId}
                      priceInRial={Number(row.buy.priceInRial)}
                      side="buy"
                      onOpen={setTicket}
                    >
                      {t("trading.action.buy")}
                    </AlertButton>
                  ) : null}
                  {hasSecret ? (
                    <AlertButton
                      exchange={row.sell.exchange}
                      instrumentId={row.instrumentId}
                      priceInRial={Number(row.sell.priceInRial)}
                      side="sell"
                      onOpen={setTicket}
                      danger
                    >
                      {t("trading.action.sell")}
                    </AlertButton>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {ticket ? (
        <TradeTicketModal
          open
          onClose={() => setTicket(null)}
          instrumentId={ticket.instrumentId}
          side={ticket.side}
          priceInRial={ticket.priceInRial}
          venues={venuesFor(ticket.instrumentId)}
          defaultVenue={ticket.venue}
          secret={secret}
          onPlaced={() => undefined}
        />
      ) : null}

      {hasSecret ? (
        <p className="text-fg-3 mt-2 text-[10.5px]">
          {t("trading.arbitrage.rules")}: {rules.data?.length ?? 0}
          {saveRule.isPending ? " …" : ""}
        </p>
      ) : null}
    </motion.section>
  );
}

function Leg({
  label,
  exchange,
  price,
  live,
}: {
  label: string;
  exchange: ExchangeId;
  price: string;
  live: boolean;
}) {
  const { locale } = useI18n();
  return (
    <span className="flex flex-col">
      <span className="text-fg-3 text-[10px]">{label}</span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={`size-1.5 rounded-full ${live ? "animate-pulse-soft" : ""}`}
          style={{
            background: venueColor(exchange),
            boxShadow: live
              ? undefined
              : `inset 0 0 0 1.5px ${venueColor(exchange)}`,
          }}
        />
        <span className="text-fg-2 text-[11.5px] font-semibold">
          {venueLabel(exchange)}
        </span>
        <span className="num text-fg text-[12px] font-bold tabular-nums">
          {formatNumber(locale, Number(price), { maximumFractionDigits: 0 })}
        </span>
      </span>
    </span>
  );
}

function AlertButton({
  exchange,
  instrumentId,
  priceInRial,
  side,
  onOpen,
  danger = false,
  children,
}: {
  exchange: ExchangeId;
  instrumentId: string;
  priceInRial: number;
  side: "buy" | "sell";
  onOpen: (value: {
    instrumentId: string;
    side: "buy" | "sell";
    priceInRial: number;
    venue: ExchangeId;
  }) => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        onOpen({ instrumentId, side, priceInRial, venue: exchange })
      }
      className="h-7 rounded-full px-3 text-[11px] font-bold transition-all duration-300 active:scale-95"
      style={{
        background: danger ? "var(--down)" : "var(--up)",
        color: "#04120c",
      }}
    >
      {children}
    </button>
  );
}
