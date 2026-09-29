"use client";

import { Alert } from "antd";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import IrPriceTable from "~/features/iran/IrPriceTable";
import { AppContainer } from "~/lib/container";
import IrPriceSocketService from "~/services/iran/IrPriceSocketService";
import type { IrTicker } from "~/services/iran/iran.types";
import { api } from "~/trpc/react";

const IrSocket = AppContainer.resolve(IrPriceSocketService);

export default function IrPricePage() {
  const [tickers, setTickers] = useState<IrTicker[]>([]);
  const [live, setLive] = useState(false);
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="panel px-5 py-5"
    >
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-fg text-[16px] font-bold tracking-tight">
            Iranian exchange prices
          </h2>
          <p className="text-fg-3 mt-1 max-w-2xl text-[12.5px] leading-relaxed">
            USDT and gold (XAUT + digital gold) quoted in IRT across Nobitex,
            Wallex, Bitpin and Tabdeal. Prices are seeded from REST and kept
            fresh over each exchange&apos;s own websocket.
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
            {live ? "websocket live" : "rest refresh only"}
          </span>
        </span>
      </header>

      <div className="flex flex-col gap-4">
        {isError && (
          <Alert
            type="warning"
            showIcon
            message="Could not load the REST snapshot"
            description={
              error instanceof Error
                ? error.message
                : "All exchanges rejected the request. They are Iran-IP only, so the request must originate from an Iranian network."
            }
          />
        )}

        <IrPriceTable tickers={tickers} loading={isLoading} connected={live} />
      </div>
    </motion.div>
  );
}
