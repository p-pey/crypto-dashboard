"use client";

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Segmented, Table } from "antd";
import { IR_ASSETS } from "~/constants/iranExchanges";
import type { IrAssetId, IrTicker } from "~/services/iran/iran.types";
import { irPriceColumns } from "./IrPriceTable.utils";

type AssetFilter = IrAssetId | "all";

type Props = {
  tickers: IrTicker[];
  loading: boolean;
  connected: boolean;
};

const EASE = [0.16, 1, 0.3, 1] as const;

export default function IrPriceTable({ tickers, loading, connected }: Props) {
  const [filter, setFilter] = useState<AssetFilter>("all");

  const dataSource = useMemo(() => {
    const rows =
      filter === "all"
        ? tickers
        : tickers.filter((ticker) => ticker.asset === filter);

    const assetOrder = new Map(
      IR_ASSETS.map((asset, index) => [asset.id, index] as const),
    );

    return [...rows].sort(
      (a, b) => (assetOrder.get(a.asset) ?? 0) - (assetOrder.get(b.asset) ?? 0),
    );
  }, [filter, tickers]);

  const best = useMemo(() => {
    const quoted = tickers.filter((t) => t.mid !== null);
    if (quoted.length === 0) return null;
    return quoted.reduce((lo, t) => (t.mid! < lo.mid! ? t : lo));
  }, [tickers]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Pairs"
          value={String(tickers.length)}
          accent="var(--brand-2)"
        />
        <Stat
          label="Transport"
          value={connected ? "socket" : "rest"}
          accent={connected ? "var(--mint)" : "var(--amber)"}
        />
        <Stat
          label="Live"
          value={String(tickers.filter((t) => t.status === "live").length)}
          accent="var(--cyan)"
        />
        <Stat
          label="Best mid"
          value={best ? best.mid!.toLocaleString("en-US") : "—"}
          accent="var(--text)"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<AssetFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { label: "All", value: "all" },
            ...IR_ASSETS.map((asset) => ({
              label: asset.label,
              value: asset.id,
            })),
          ]}
        />
      </div>

      <Table<IrTicker>
        rowKey="key"
        size="middle"
        loading={loading && tickers.length === 0}
        dataSource={dataSource}
        columns={irPriceColumns}
        pagination={false}
        scroll={{ x: 1040 }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="panel px-4 py-3.5"
    >
      <p className="text-fg-3 text-[10.5px] font-semibold tracking-[0.12em] uppercase">
        {label}
      </p>
      <p
        className="num mt-1 truncate text-[20px] leading-none font-extrabold tabular-nums"
        style={{ color: accent }}
      >
        {value}
      </p>
    </motion.div>
  );
}
