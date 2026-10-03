"use client";

import { Alert } from "antd";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import IrMarketBoard, { type QuoteUnit } from "~/features/iran/IrMarketBoard";
import type { TradeIntent } from "~/features/iran/board.columns";
import AccountPanel from "~/features/trading/AccountPanel";
import ArbitragePanel from "~/features/trading/ArbitragePanel";
import TradeTicketModal from "~/features/trading/TradeTicketModal";
import { useTradingSecret } from "~/features/trading/useTradingSecret";
import { buildMarketBoard } from "~/features/iran/iranMarket.mapper";
import { AppContainer } from "~/lib/container";
import { useI18n } from "~/i18n/I18nProvider";
import IrPriceSocketService from "~/services/iran/IrPriceSocketService";
import type { IrTicker } from "~/services/iran/iran.types";
import { api } from "~/trpc/react";
import type { ExchangeId } from "~/services/trading/trading.types";
import type { MarketRow } from "~/services/iran/iran.market.types";

const IrSocket = AppContainer.resolve(IrPriceSocketService);

/**
 * How often the providers without a websocket are crawled.
 *
 * The exchange order books arrive over a websocket, so re-requesting them just
 * costs a round trip. What is left is crawled: nerkh.io's rate feed and the
 * Wallex market list. A minute is frequent enough to feel current and slow
 * enough to stay polite to endpoints that are scraping an Iranian exchange
 * from outside it.
 */
const POLL_INTERVAL_MS = 60_000;

export default function IrPricePage() {
  const { locale, t } = useI18n();
  const [tickers, setTickers] = useState<IrTicker[]>([]);
  const [unit, setUnit] = useState<QuoteUnit>("rial");
  const [ticket, setTicket] = useState<
    (TradeIntent & { venue: ExchangeId }) | null
  >(null);
  const startedRef = useRef(false);
  const utils = api.useUtils();
  const refreshPolled = api.iran.refreshPolled.useMutation();

  const { secret, setSecret, hasSecret } = useTradingSecret();

  /**
   * Which venues list each instrument, and under what symbol.
   *
   * Read from the trading metadata rather than from the board, because the board
   * normalises symbols for display while an order has to be sent with the
   * venue's own spelling.
   */
  const markets = api.trading.markets.useQuery(undefined, {
    staleTime: 10 * 60_000,
  });

  const venuesFor = useMemo(
    () => (instrumentId: string) =>
      (markets.data ?? [])
        .filter((spec) => spec.instrumentId === instrumentId)
        .map((spec) => ({ exchange: spec.exchange, symbol: spec.symbol })),
    [markets.data],
  );

  /**
   * Opens the ticket for whichever venue the operator clicked.
   *
   * When several venues list the instrument the board row's own source is
   * preferred, because that is the price the operator was looking at. Falling
   * back to the first listed venue keeps the button working when the row came
   * from a source with no trading market of its own.
   */
  const openTicket = useCallback(
    (intent: TradeIntent & { source?: string }) => {
      const venues = venuesFor(intent.instrumentId);
      if (venues.length === 0) return;
      const preferred =
        venues.find((row) => row.exchange === intent.source)?.exchange ??
        venues[0]?.exchange;
      if (!preferred) return;
      setTicket({ ...intent, venue: preferred });
    },
    [venuesFor],
  );

  /**
   * The REST order book snapshot. It seeds the websocket layer and doubles as
   * the safety net for exchanges whose socket stays down; `mergeSnapshot` skips
   * rows that are already streaming, so a slower cadence never rolls a live
   * price back to a stale one.
   */
  const { data, isLoading, isError, error, dataUpdatedAt } =
    api.iran.getTickers.useQuery(undefined, {
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchInterval: POLL_INTERVAL_MS,
    });

  /** Wallex's whole Toman market list. Crawled: there is no stream for it. */
  const {
    data: boards,
    isError: boardsError,
    error: boardsErr,
    dataUpdatedAt: boardsUpdatedAt,
  } = api.iran.getBoards.useQuery(undefined, {
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  /** nerkh.io's rate feed, merged in beside the exchange prices. Crawled. */
  const {
    data: nerkh,
    isError: nerkhError,
    error: nerkhErr,
    dataUpdatedAt: nerkhUpdatedAt,
  } = api.nerkh.getSnapshot.useQuery(undefined, {
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  useEffect(() => {
    const unsubscribe = IrSocket.subscribe((next) => setTickers(next));

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!data) return;

    if (!startedRef.current) {
      startedRef.current = true;
      IrSocket.start(data.tickers, data.resolved);
      return;
    }

    IrSocket.mergeSnapshot(data.tickers);
  }, [data]);

  useEffect(() => {
    return () => {
      if (startedRef.current) {
        IrSocket.stop();
        startedRef.current = false;
      }
    };
  }, []);

  /**
   * Re-crawls only the providers without a websocket.
   *
   * The crawl caches live server-side, so this goes through a mutation that
   * passes `force` as real input; a client-side refetch would come back from
   * the server's own cache and change nothing. The result is written into the
   * two queries the board already renders, which also advances their
   * `dataUpdatedAt`, so the "last updated" stamp follows the real crawl.
   *
   * The exchange order books are left alone on purpose: their sockets are
   * already pushing ticks, so asking again would spend a round trip to receive
   * numbers older than the ones already on screen.
   */
  const refresh = useCallback(async () => {
    const fresh = await refreshPolled.mutateAsync();
    utils.iran.getBoards.setData(undefined, { boards: fresh.boards });
    utils.nerkh.getSnapshot.setData(undefined, fresh.snapshot);
  }, [refreshPolled, utils]);

  /**
   * The board is assembled from three sources that refresh on their own
   * schedules, so the useful "last updated" is the newest of the three rather
   * than any single query's timestamp.
   */
  const lastUpdated = useMemo(() => {
    const stamps = [dataUpdatedAt, boardsUpdatedAt, nerkhUpdatedAt].filter(
      (value): value is number => typeof value === "number" && value > 0,
    );
    return stamps.length > 0 ? Math.max(...stamps) : null;
  }, [boardsUpdatedAt, dataUpdatedAt, nerkhUpdatedAt]);

  /**
   * The same row set the board renders.
   *
   * Built once here so the spread panel reads from it instead of assembling a
   * second copy from the same three feeds, which would double the work and
   * could disagree with what the operator is looking at.
   */
  const boardRows: MarketRow[] = useMemo(
    () => buildMarketBoard({ tickers, boards: boards?.boards ?? [], nerkh, locale }),
    [boards, locale, nerkh, tickers],
  );

  const alerts = useMemo(() => {
    const list: { key: string; message: string; description: string }[] = [];

    if (isError) {
      list.push({
        key: "exchanges",
        message: t("irPrice.errorTitle"),
        description:
          error instanceof Error ? error.message : t("irPrice.errorFallback"),
      });
    }
    if (boardsError) {
      list.push({
        key: "boards",
        message: t("irPrice.boardErrorTitle"),
        description:
          boardsErr instanceof Error
            ? boardsErr.message
            : t("irPrice.boardError"),
      });
    }
    if (nerkhError) {
      list.push({
        key: "nerkh",
        message: t("irPrice.nerkhErrorTitle"),
        description:
          nerkhErr instanceof Error
            ? nerkhErr.message
            : t("irPrice.nerkhError"),
      });
    }
    if (nerkh?.stale) {
      list.push({
        key: "nerkh-stale",
        message: t("nerkh.staleWarning"),
        description: nerkh.error ?? "",
      });
    }

    return list;
  }, [boardsError, boardsErr, error, isError, nerkh, nerkhError, nerkhErr, t]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="panel px-5 py-5"
    >
      <header className="mb-5">
        <div className="max-w-3xl">
          <h2 className="text-fg text-[16px] font-bold tracking-tight">
            {t("irPrice.title")}
          </h2>
          <p className="text-fg-3 mt-1 text-[12.5px] leading-relaxed">
            {t("irPrice.description")}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        {alerts.map((alert) => (
          <Alert
            key={alert.key}
            type="warning"
            showIcon
            message={alert.message}
            description={alert.description || undefined}
          />
        ))}

        <IrMarketBoard
          tickers={tickers}
          boards={boards?.boards ?? []}
          nerkh={nerkh}
          loading={isLoading}
          unit={unit}
          onUnit={setUnit}
          onRefresh={refresh}
          refreshing={refreshPolled.isPending}
          updatedAt={lastUpdated}
          onTrade={hasSecret ? (intent) => openTicket(intent) : null}
        />

        {/*
          The account and spread panels reuse the rows already assembled for the
          board, so neither adds a request against a rate-limited venue.
        */}
        <AccountPanel secret={secret} hasSecret={hasSecret} onSecret={setSecret} />

        <ArbitragePanel
          rows={boardRows}
          secret={secret}
          hasSecret={hasSecret}
          venuesFor={venuesFor}
        />

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
            onPlaced={() => {
              void utils.trading.balances.invalidate();
              void utils.trading.openOrders.invalidate();
            }}
          />
        ) : null}
      </div>
    </motion.div>
  );
}
