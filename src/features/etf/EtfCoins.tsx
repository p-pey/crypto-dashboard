"use client";

import { Select } from "antd";
import { Coins } from "lucide-react";

export const ETF_ASSETS = [
  { value: "BTC", label: "Bitcoin" },
  { value: "ETH", label: "Ethereum" },
  { value: "SOL", label: "Solana" },
  { value: "XRP", label: "XRP" },
  { value: "DOGE", label: "Dogecoin" },
] as const;

export type EtfAsset = (typeof ETF_ASSETS)[number]["value"];

export default function EtfCoins({
  value,
  onChange,
}: {
  value: EtfAsset;
  onChange: (value: EtfAsset) => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-fg flex items-center gap-2 text-[16px] font-bold tracking-tight">
          <Coins className="text-brand-2 size-[18px]" strokeWidth={2.2} />
          Daily ETF flow
        </h2>
        <p className="text-fg-3 mt-0.5 text-[12px]">
          Intraday price action across spot ETF products
        </p>
      </div>

      <Select<EtfAsset>
        value={value}
        onChange={onChange}
        style={{ width: 220 }}
        options={ETF_ASSETS.map((a) => ({ value: a.value, label: a.label }))}
      />
    </div>
  );
}
