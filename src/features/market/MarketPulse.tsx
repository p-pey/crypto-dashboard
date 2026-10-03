"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import { Meter, Pill, Stat, StatGrid } from "~/components/ui";
import { toneForSign } from "~/components/ui";
import { formatCompact, formatPercent, formatRelative } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { api } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The whole-market strip.
 *
 * This is the one thing the app had no answer for, and its absence is why a
 * coin's move could not be interpreted: a 3% drop means one thing when the
 * market is up and something else when everything is down. Total capitalisation,
 * 24h volume, dominance and the Fear & Greed index together answer "is this
 * coin's move its own news, or the market's?".
 *
 * All four figures are free and keyless. CoinMarketCap would also supply them,
 * but its API is a paid Pro tier, so nothing here depends on one.
 */
export default function MarketPulse({
  compactMode = false,
}: {
  compactMode?: boolean;
}) {
  const { locale, t } = useI18n();

  const { data, isLoading, dataUpdatedAt } =
    api.overview.getMarketStats.useQuery(
      {},
      { staleTime: 120_000, refetchInterval: 180_000 },
    );

  const global = data?.global;
  const fng = data?.fearAndGreed;

  const fngTone = useMemo(() => {
    if (fng?.value === null || fng?.value === undefined)
      return "muted" as const;
    if (fng.value >= 75) return "up" as const;
    if (fng.value <= 25) return "down" as const;
    return "neutral" as const;
  }, [fng?.value]);

  if (isLoading && !global) {
    return (
      <div className="panel px-5 py-5" aria-hidden>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="bg-surface-3 h-[74px] animate-pulse rounded-[14px]"
            />
          ))}
        </div>
      </div>
    );
  }

  const change = global?.marketCapChange24h ?? null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="panel px-5 py-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-fg text-[11px] font-bold tracking-[0.13em] uppercase">
          {t("market.pulse")}
        </h2>
        {dataUpdatedAt && (
          <span className="text-fg-3 text-[10.5px] font-medium">
            {formatRelative(locale, dataUpdatedAt)}
          </span>
        )}
      </div>

      <StatGrid min={compactMode ? 130 : 150}>
        <Stat
          label={t("market.globalCap")}
          value={formatCompact(locale, global?.marketCap ?? null)}
          hint={
            change === null
              ? undefined
              : `${formatPercent(locale, change)} ${t("market.in24h")}`
          }
          tone={change === null ? undefined : toneForSign(change, 0.05)}
        />

        <Stat
          label={t("market.globalVolume")}
          value={formatCompact(locale, global?.volume24h ?? null)}
          hint={t("market.in24h")}
        />

        <Stat
          label={t("market.dominance")}
          value={
            global?.dominance?.btc === null ||
            global?.dominance?.btc === undefined
              ? "—"
              : formatPercent(locale, global.dominance.btc * 100, 1)
          }
          hint={t("market.btcShare")}
          tone="amber"
        />

        <Stat
          label={t("market.ethShare")}
          value={
            global?.dominance?.eth === null ||
            global?.dominance?.eth === undefined
              ? "—"
              : formatPercent(locale, global.dominance.eth * 100, 1)
          }
          tone="brand"
        />

        <div className="border-line bg-surface-2/50 flex flex-col justify-between rounded-[14px] border px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-fg-3 text-[10px] font-bold tracking-[0.12em] uppercase">
              {t("market.fearGreed")}
            </span>
            {fng?.classification && (
              <Pill tone={fngTone} size="sm">
                {fng.classification}
              </Pill>
            )}
          </div>
          <p
            className="num mt-1 text-[15px] leading-tight font-extrabold tabular-nums"
            style={{
              color:
                fngTone === "up"
                  ? "var(--up)"
                  : fngTone === "down"
                    ? "var(--down)"
                    : "var(--fg)",
            }}
          >
            {fng?.value ?? "—"}
          </p>
          {/* The scale runs fear to greed, so the fill is one continuous bar
              rather than a diverging one: the value is a position on a spectrum,
              not a signed move. */}
          <div className="mt-2">
            <Meter
              value={fng?.value ?? 0}
              max={100}
              diverging={false}
              height={4}
              label={t("market.fearGreed")}
              tone={fngTone}
            />
          </div>
        </div>
      </StatGrid>

      {global?.error && (
        <p className="text-fg-3 mt-2 text-[10px]">{global.error}</p>
      )}
    </motion.section>
  );
}
