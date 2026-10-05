"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import {
  Label,
  Meter,
  Panel,
  PanelBox,
  Pill,
  Stat,
  StatGrid,
  toneForSign,
} from "~/components/ui";
import {
  formatCompact,
  formatNumber,
  formatRelative,
  formatSignedPercent,
} from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { api } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * An independent second opinion on price.
 *
 * Every other price in this app comes from either CoinGecko or an exchange, and
 * **a single source cannot reveal its own error.** A wrong figure from one place
 * is displayed confidently with nothing on screen to contradict it. CoinPaprika is
 * a separate indexer with separate venue coverage, so the two agreeing genuinely
 * raises confidence, and the two disagreeing is itself the finding.
 *
 * It also carries the **exchange ranking** free — the figure `market-data.md`
 * lists as CoinMarketCap Pro-only, with volume already adjusted for suspected wash
 * trading, which is why the adjusted figure is what the ranking uses.
 */
export default function CrossCheckPanel() {
  const { locale, t } = useI18n();

  const { data, isLoading, dataUpdatedAt } =
    api.insights.alternativePrices.useQuery(
      {},
      { staleTime: 10 * 60_000, refetchInterval: 15 * 60_000, retry: false },
    );

  const tickers = useMemo(() => (data?.tickers ?? []).slice(0, 14), [data?.tickers]);
  const exchanges = useMemo(
    () => (data?.exchanges ?? []).slice(0, 10),
    [data?.exchanges],
  );

  const global = data?.global;

  if (isLoading && !data) {
    return (
      <Panel title={t("crossCheck.title")}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="bg-surface-3 h-[74px] animate-pulse rounded-[14px]"
            />
          ))}
        </div>
      </Panel>
    );
  }

  const maxCap = tickers[0]?.marketCapUsd ?? 1;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="panel px-5 py-5"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-fg text-[13px] font-bold tracking-tight">
            {t("crossCheck.title")}
          </h2>
          <p className="text-fg-3 mt-0.5 max-w-2xl text-[11px] leading-relaxed">
            {t("crossCheck.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {data?.sources.map((source) => (
            <Pill
              key={source.id}
              tone={source.ok ? "up" : "amber"}
              size="sm"
              title={source.error ?? undefined}
            >
              {source.label}
            </Pill>
          ))}
          {global?.lastUpdated ? (
            <span className="text-fg-3 text-[10.5px]">
              {t("crossCheck.lastUpdated")}{" "}
              {formatRelative(locale, global.lastUpdated * 1000)}
            </span>
          ) : dataUpdatedAt > 0 ? (
            <span className="text-fg-3 text-[10.5px]">
              {formatRelative(locale, dataUpdatedAt)}
            </span>
          ) : null}
        </div>
      </header>

      <StatGrid min={130} className="mb-4">
        <Stat label={t("crossCheck.marketCap")} value={formatCompact(locale, global?.marketCapUsd)} />
        <Stat
          label={t("crossCheck.volume")}
          value={formatCompact(locale, global?.volume24hUsd)}
          hintValue={formatSignedPercent(locale, global?.marketCapChange24h ?? null, 1)}
          hintTone={toneForSign(global?.marketCapChange24h ?? null, 0.05)}
        />
        <Stat
          label={t("crossCheck.dominance")}
          value={
            global?.btcDominance == null
              ? "—"
              : formatNumber(locale, global.btcDominance, {
                  maximumFractionDigits: 1,
                }) + "%"
          }
          tone="brand"
        />
        <Stat
          label={t("crossCheck.coinsTracked")}
          value={formatNumber(locale, global?.coinsTracked ?? null)}
        />
      </StatGrid>

      {tickers.length === 0 ? (
        <PanelBox>
          <p className="text-fg-3 text-[11px]">{data?.error ?? t("crossCheck.noRows")}</p>
        </PanelBox>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex flex-col gap-1">
              {tickers.map((row) => (
                <div
                  key={row.id}
                  className="border-line bg-surface-2/40 flex items-center gap-3 rounded-[10px] border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-fg text-[12px] font-bold">
                        {row.symbol}
                      </span>
                      <span className="text-fg-3 truncate text-[10px]">
                        {row.name}
                      </span>
                    </div>
                    <div className="mt-1">
                      <Meter
                        value={maxCap > 0 ? (row.marketCapUsd ?? 0) / maxCap : 0}
                        diverging={false}
                        tone="brand"
                      />
                    </div>
                  </div>

                  <div className="w-[80px] shrink-0 text-end">
                    <Label>{t("crossCheck.price")}</Label>
                    <span className="num text-fg block text-[12px] font-bold tabular-nums">
                      {formatCompact(locale, row.priceUsd)}
                    </span>
                  </div>
                  <div className="w-[74px] shrink-0 text-end">
                    <Label>{t("crossCheck.change24h")}</Label>
                    <span
                      className="num block text-[12px] font-bold tabular-nums"
                      style={{
                        color: `var(--${row.change24h === null ? "text-3" : row.change24h > 0.05 ? "up" : row.change24h < -0.05 ? "down" : "text-2"})`,
                      }}
                    >
                      {formatSignedPercent(locale, row.change24h, 1)}
                    </span>
                  </div>
                  <div className="w-[62px] shrink-0 text-end">
                    <Label>{t("crossCheck.turnover")}</Label>
                    <span className="num text-fg-2 block text-[12px] font-bold tabular-nums">
                      {row.volToMarketCap == null
                        ? "—"
                        : formatNumber(locale, row.volToMarketCap, {
                            maximumFractionDigits: 2,
                          }) + "x"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">{t("crossCheck.exchanges")}</Label>
            <div className="flex flex-col gap-1">
              {exchanges.map((row) => (
                <div
                  key={row.id}
                  className="border-line bg-surface-2/40 flex items-center gap-3 rounded-[10px] border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-fg truncate text-[12px] font-semibold">
                        {row.name}
                      </span>
                      {!row.isActive && (
                        <Pill tone="amber" size="sm">
                          {t("onchain.unreachable")}
                        </Pill>
                      )}
                    </div>
                    {row.volumeShare !== null && (
                      <div className="mt-1">
                        <Meter
                          value={row.volumeShare}
                          diverging={false}
                          tone="cyan"
                        />
                      </div>
                    )}
                  </div>

                  <div className="w-[86px] shrink-0 text-end">
                    <Label>{t("crossCheck.exchangeVolume")}</Label>
                    <span className="num text-fg block text-[12px] font-bold tabular-nums">
                      {formatCompact(locale, row.volume24h)}
                    </span>
                  </div>
                  <div className="w-[64px] shrink-0 text-end">
                    <Label>{t("crossCheck.share")}</Label>
                    <span className="num text-fg-2 block text-[12px] font-bold tabular-nums">
                      {row.volumeShare == null
                        ? "—"
                        : formatNumber(locale, row.volumeShare * 100, {
                            maximumFractionDigits: 2,
                          }) + "%"}
                    </span>
                  </div>
                  <div className="w-[54px] shrink-0 text-end">
                    <Label>{t("crossCheck.turnover")}</Label>
                    <span className="num text-fg-3 block text-[12px] font-bold tabular-nums">
                      {row.trustScore == null ? "—" : `${row.trustScore}/10`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-fg-3 mt-1.5 text-[10px]">
              {t("crossCheck.washAdjusted")}
            </p>
          </div>
        </div>
      )}
    </motion.section>
  );
}