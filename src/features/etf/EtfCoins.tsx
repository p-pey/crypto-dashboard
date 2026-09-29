"use client";

import { Select } from "antd";
import { Coins } from "lucide-react";
import { useI18n } from "~/i18n/I18nProvider";
import type { TranslationKey } from "~/i18n/dictionaries/types";

export const ETF_ASSETS = ["BTC", "ETH", "SOL", "XRP", "DOGE"] as const;

export type EtfAsset = (typeof ETF_ASSETS)[number];

export default function EtfCoins({
  value,
  onChange,
}: {
  value: EtfAsset;
  onChange: (value: EtfAsset) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-fg flex items-center gap-2 text-[16px] font-bold tracking-tight">
          <Coins className="text-brand-2 size-[18px]" strokeWidth={2.2} />
          {t("etfs.title")}
        </h2>
        <p className="text-fg-3 mt-0.5 text-[12px]">{t("etfs.subtitle")}</p>
      </div>

      <Select<EtfAsset>
        value={value}
        onChange={onChange}
        style={{ width: 220 }}
        options={ETF_ASSETS.map((asset) => ({
          value: asset,
          label: t(`etfs.assets.${asset}` as TranslationKey),
        }))}
      />
    </div>
  );
}
