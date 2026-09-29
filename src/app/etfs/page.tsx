"use client";

import { motion } from "motion/react";
import { useState } from "react";
import EtfCoins, { type EtfAsset } from "~/features/etf/EtfCoins";
import EtfList from "~/features/etf/EtfList";
import { api } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

export default function Etfs() {
  const [asset, setAsset] = useState<EtfAsset>("BTC");
  const {
    data: etfs = [],
    isLoading,
    isError,
  } = api.etf.getEtf.useQuery(
    { symbol: asset },
    { refetchOnWindowFocus: false, placeholderData: (prev) => prev },
  );

  return (
    <div className="flex flex-col gap-4">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="panel px-5 py-4"
      >
        <EtfCoins value={asset} onChange={setAsset} />
      </motion.div>

      {isLoading &&
        Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="panel h-[248px] animate-pulse overflow-hidden"
            aria-hidden
          />
        ))}

      {isError && (
        <div className="panel text-down px-5 py-8 text-center text-[13px]">
          Could not reach the market data provider. Try again shortly.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {etfs.map((etf, index) => (
          <EtfList key={etf.etf.id} data={etf.data} index={index} />
        ))}
      </div>
    </div>
  );
}
