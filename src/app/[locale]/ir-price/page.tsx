"use client";

import { Alert } from "antd";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import IrMarketBoard, { type QuoteUnit } from "~/features/iran/IrMarketBoard";
import { AppContainer } from "~/lib/container";
import { useI18n } from "~/i18n/I18nProvider";
import IrPriceSocketService from "~/services/iran/IrPriceSocketService";
import type { IrTicker } from "~/services/iran/iran.types";
import { api } from "~/trpc/react";

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
  const { t } = useI18n();
  const [tickers, setTickers] = useState<IrTicker[]>([]);
  const [unit, setUnit] = useState<QuoteUnit>("rial");
  const startedRef = useRef(false);
  const utils = api.useUtils();
  const refreshPolled = api.iran.refreshPolled.useMutation();

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
        />
      </div>
    </motion.div>
  );
}
