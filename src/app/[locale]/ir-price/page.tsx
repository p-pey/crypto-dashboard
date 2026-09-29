"use client";

import { Alert } from "antd";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import IrMarketTable, { type QuoteUnit } from "~/features/iran/IrMarketTable";
import { AppContainer } from "~/lib/container";
import { useI18n } from "~/i18n/I18nProvider";
import IrPriceSocketService from "~/services/iran/IrPriceSocketService";
import type { IrTicker } from "~/services/iran/iran.types";
import { api } from "~/trpc/react";

const IrSocket = AppContainer.resolve(IrPriceSocketService);

export default function IrPricePage() {
  const { t } = useI18n();
  const [tickers, setTickers] = useState<IrTicker[]>([]);
  const [live, setLive] = useState(false);
  const [unit, setUnit] = useState<QuoteUnit>("rial");
  const startedRef = useRef(false);

  const { data, isLoading, isError, error } = api.iran.getTickers.useQuery(
    undefined,
    {
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      // Doubles as the safety net for exchanges whose socket stays down.
      refetchInterval: 20_000,
    },
  );

  /** Wallex's whole Toman market list, one request per poll. */
  const {
    data: boards,
    isError: boardsError,
    error: boardsErr,
  } = api.iran.getBoards.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  /** nerkh.io's rate feed, merged in beside the exchange prices. */
  const {
    data: nerkh,
    isError: nerkhError,
    error: nerkhErr,
  } = api.nerkh.getSnapshot.useQuery(undefined, {
    refetchInterval: 25_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  useEffect(() => {
    const unsubscribe = IrSocket.subscribe((next) => {
      if (
        next.some(
          (ticker) => ticker.status === "live" && ticker.source === "socket",
        )
      ) {
        setLive(true);
      }
      setTickers(next);
    });

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
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="text-fg text-[16px] font-bold tracking-tight">
            {t("irPrice.title")}
          </h2>
          <p className="text-fg-3 mt-1 text-[12.5px] leading-relaxed">
            {t("irPrice.description")}
          </p>
        </div>

        <span className="border-line bg-surface-2/70 inline-flex items-center gap-2 rounded-full border px-3 py-1.5">
          <span className="relative flex size-1.5">
            {live && (
              <span className="bg-mint absolute inline-flex size-full animate-ping rounded-full opacity-70" />
            )}
            <span
              className="relative inline-flex size-1.5 rounded-full"
              style={{ background: live ? "var(--mint)" : "var(--amber)" }}
            />
          </span>
          <span className="text-fg-2 text-[11px] font-semibold">
            {live ? t("irPrice.websocketLive") : t("irPrice.restOnly")}
          </span>
        </span>
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

        <IrMarketTable
          tickers={tickers}
          boards={boards?.boards ?? []}
          nerkh={nerkh}
          loading={isLoading}
          unit={unit}
          onUnit={setUnit}
          live={live}
        />
      </div>
    </motion.div>
  );
}
