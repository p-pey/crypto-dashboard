"use client";

import { Segmented } from "antd";
import type { Locale } from "~/i18n/config";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
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
import { formatCompact, formatDate, formatNumber, formatRelative, formatSignedPercent } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { api, type RouterOutputs } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

type Tab = "tvl" | "fees" | "volume" | "stablecoins" | "reserves" | "hacks";

/**
 * The DeFi layer, from DefiLlama.
 *
 * Six views over one free source, chosen because they answer six different
 * questions and only two of them are about size:
 *
 * - **TVL** — how much capital is locked, and TVL against market cap, which is a
 *   valuation statement rather than a size one.
 * - **Fees** — gross fees and revenue as *separate columns*. Conflating them is
 *   the most common error in crypto analytics: a DEX that collects $10M and keeps
 *   $1M is a normal, healthy business, and reporting the first number alone
 *   overstates it tenfold.
 * - **Stablecoins** — supply growth, which *leads* deployment rather than
 *   following price, and therefore belongs beside the macro figures.
 * - **Reserves** — what exchanges say they hold, minus what is known to be counted
 *   twice across venues.
 * - **Exploits** — losses **net of returned funds**, because an exploit that stole
 *   $40M and returned $30M cost $10M and a board showing $40M would be measuring
 *   publicity.
 *
 * Every tab keeps its own query alive so switching does not refetch, and each
 * carries its own `stale`/`error` so one slow route cannot blank the page.
 */
export default function DefiPanel() {
  const { locale, t } = useI18n();
  const [tab, setTab] = useState<Tab>("tvl");

  const protocols = api.insights.protocols.useQuery(
    {},
    { staleTime: 60 * 60_000, refetchInterval: 60 * 60_000, retry: false },
  );
  const fees = api.insights.fees.useQuery(
    {},
    { staleTime: 30 * 60_000, refetchInterval: 30 * 60_000, retry: false },
  );
  const dexVolume = api.insights.dexVolume.useQuery(
    {},
    { staleTime: 30 * 60_000, refetchInterval: 30 * 60_000, retry: false },
  );
  const stablecoins = api.insights.stablecoins.useQuery(
    {},
    { staleTime: 15 * 60_000, refetchInterval: 15 * 60_000, retry: false },
  );
  const reserves = api.insights.cexReserves.useQuery(
    {},
    { staleTime: 60 * 60_000, refetchInterval: 60 * 60_000, retry: false },
  );
  const hacks = api.insights.hacks.useQuery(
    {},
    { staleTime: 12 * 60 * 60_000, refetchInterval: 12 * 60 * 60_000, retry: false },
  );

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
            {t("defi.title")}
          </h2>
          <p className="text-fg-3 mt-0.5 max-w-2xl text-[11px] leading-relaxed">
            {t("defi.subtitle")}
          </p>
        </div>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          size="small"
          options={(Object.keys(TAB_KEYS) as Tab[]).map((key) => ({
            value: key,
            label: t(`defi.tab.${key}`),
          }))}
        />
      </header>

      {tab === "tvl" && <TvlView data={protocols.data} loading={protocols.isLoading} />}
      {tab === "fees" && <FeesView data={fees.data} loading={fees.isLoading} />}
      {tab === "volume" && <VolumeView data={dexVolume.data} loading={dexVolume.isLoading} />}
      {tab === "stablecoins" && (
        <StablecoinsView data={stablecoins.data} loading={stablecoins.isLoading} />
      )}
      {tab === "reserves" && (
        <ReservesView data={reserves.data} loading={reserves.isLoading} />
      )}
      {tab === "hacks" && <HacksView data={hacks.data} loading={hacks.isLoading} />}
    </motion.section>
  );
}

const TAB_KEYS: Record<Tab, true> = {
  tvl: true,
  fees: true,
  volume: true,
  stablecoins: true,
  reserves: true,
  hacks: true,
};

/* ------------------------------------------------------------------ */
/* Shared row primitives
 * ------------------------------------------------------------------ */

/** A label/value row, used by every table below. */
function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "neutral" | "muted" | "brand" | "amber" | "cyan";
}) {
  return (
    <div className="min-w-0 text-end">
      <Label tone={tone ?? "muted"}>{label}</Label>
      <span
        dir="ltr"
        className={`num block text-[12px] font-bold tabular-nums ${
          tone ? "" : "text-fg"
        }`}
        style={tone ? { color: `var(--${toneVar(tone)})` } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function toneVar(tone: string): string {
  return tone === "up"
    ? "up"
    : tone === "down"
      ? "down"
      : tone === "brand"
        ? "brand-2"
        : tone === "amber"
          ? "amber"
          : tone === "cyan"
            ? "cyan"
            : "text-2";
}

function Skeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="bg-surface-3 h-[42px] animate-pulse rounded-[10px]" />
      ))}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  const { t } = useI18n();
  return (
    <PanelBox>
      <p className="text-fg-3 text-[11px]">{message || t("defi.empty")}</p>
    </PanelBox>
  );
}

/** Renders a number, or an em dash when the source did not report it. */
function num(
  locale: Locale,
  value: number | null | undefined,
  compact = true,
) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return compact ? formatCompact(locale, value) : formatNumber(locale, value);
}

/* ------------------------------------------------------------------ */
/* TVL
 * ------------------------------------------------------------------ */

/**
 * Router output aliases, so a view cannot drift from the procedure it reads.
 *
 * The trailing `| undefined` matters: a tRPC query has no data before its first
 * resolve, and every view below is written to handle that with the same skeleton
 * rather than each inventing its own guard.
 */
type ProtocolsData = RouterOutputs["insights"]["protocols"] | undefined;
type FeesData = RouterOutputs["insights"]["fees"] | undefined;
type VolumeData = RouterOutputs["insights"]["dexVolume"] | undefined;
type StablecoinsData = RouterOutputs["insights"]["stablecoins"] | undefined;
type ReservesData = RouterOutputs["insights"]["cexReserves"] | undefined;
type HacksData = RouterOutputs["insights"]["hacks"] | undefined;

function TvlView({
  data,
  loading,
}: {
  data: ProtocolsData;
  loading: boolean;
}) {
  const { locale, t } = useI18n();
  const rows = useMemo(() => (data?.protocols ?? []).slice(0, 18), [data?.protocols]);

  if (loading && !data) return <Skeleton />;
  if (rows.length === 0) return <Empty message={data?.error ?? ""} />;

  const totalTvl = rows.reduce((sum, row) => sum + (row.tvl ?? 0), 0);
  const top = rows[0];
  const bestRatio = [...rows]
    .filter((row) => row.tvlToMcap !== null)
    .sort((a, b) => (b.tvlToMcap ?? 0) - (a.tvlToMcap ?? 0))[0];

  return (
    <>
      <StatGrid min={130} className="mb-4">
        <Stat label={t("defi.totalTvl")} value={formatCompact(locale, totalTvl)} />
        <Stat label={t("defi.protocol")} value={formatNumber(locale, rows.length)} />
        <Stat
          label={t("defi.tvl")}
          value={num(locale, top?.tvl)}
          hint={top?.name}
        />
        <Stat
          label={t("defi.tvlToMcap")}
          value={
            bestRatio?.tvlToMcap == null
              ? "—"
              : formatNumber(locale, bestRatio.tvlToMcap, {
                  maximumFractionDigits: 2,
                }) + "x"
          }
          hint={bestRatio?.name}
          tone="brand"
        />
      </StatGrid>

      <p className="text-fg-3 mb-2 text-[10px] leading-relaxed">
        {t("defi.tvlNote")}
      </p>

      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div
            key={row.id}
            className="border-line bg-surface-2/40 flex items-center gap-3 rounded-[10px] border px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-fg truncate text-[12px] font-semibold">
                  {row.name}
                </span>
                {row.symbol && (
                  <span className="text-fg-3 shrink-0 text-[10px]">
                    {row.symbol}
                  </span>
                )}
              </div>
              <span className="text-fg-3 block truncate text-[10px]">
                {row.category ?? "—"}
                {row.topChain ? ` · ${row.topChain}` : ""}
                {row.chainCount > 1 ? ` +${row.chainCount - 1}` : ""}
              </span>
            </div>

            <div className="w-[86px] shrink-0">
              <Cell label={t("defi.tvl")} value={num(locale, row.tvl)} />
            </div>
            <div className="w-[86px] shrink-0">
              <Cell label={t("defi.mcap")} value={num(locale, row.mcap)} />
            </div>
            <div className="w-[70px] shrink-0">
              <Cell
                label={t("defi.tvlToMcap")}
                value={
                  row.tvlToMcap == null
                    ? "—"
                    : formatNumber(locale, row.tvlToMcap, {
                        maximumFractionDigits: 2,
                      }) + "x"
                }
                tone={
                  row.tvlToMcap !== null && row.tvlToMcap > 1 ? "brand" : undefined
                }
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Fees and revenue
 * ------------------------------------------------------------------ */

function FeesView({ data, loading }: { data: FeesData; loading: boolean }) {
  const { locale, t } = useI18n();
  const rows = useMemo(() => (data?.protocols ?? []).slice(0, 18), [data?.protocols]);

  if (loading && !data) return <Skeleton />;
  if (rows.length === 0) return <Empty message={data?.error ?? ""} />;

  const totals = data?.totals;

  /**
   * The two totals are reported separately and the panel says which side is
   * stale. Collapsing them into one "protocol revenue" figure would misstate
   * every exchange on the board.
   */
  const staleSides = [
    data?.feesStale ? t("defi.totalFees") : null,
    data?.revenueStale ? t("defi.totalRevenue") : null,
  ].filter(Boolean);

  return (
    <>
      <StatGrid min={130} className="mb-4">
        <Stat
          label={t("defi.totalFees")}
          value={num(locale, totals?.fees24h)}
          tone={data?.feesStale ? "muted" : undefined}
        />
        <Stat
          label={t("defi.totalRevenue")}
          value={num(locale, totals?.revenue24h)}
          tone={data?.revenueStale ? "muted" : undefined}
        />
        <Stat label={t("defi.fees24h")} value={num(locale, totals?.fees30d)} />
        <Stat label={t("defi.totalRevenue")} value={num(locale, totals?.revenueAllTime)} />
      </StatGrid>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-fg-3 text-[10px] leading-relaxed">{t("defi.feesNote")}</p>
        {staleSides.map((side) => (
          <Pill key={side} tone="amber" size="sm">
            {side}: {t("sourceState.stale")}
          </Pill>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div
            key={row.slug ?? row.name}
            className="border-line bg-surface-2/40 flex items-center gap-3 rounded-[10px] border px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <span className="text-fg block truncate text-[12px] font-semibold">
                {row.name}
              </span>
              <span className="text-fg-3 block truncate text-[10px]">
                {row.category ?? "—"}
              </span>
            </div>

            <div className="w-[82px] shrink-0">
              <Cell label={t("defi.fees24h")} value={num(locale, row.fees24h)} />
            </div>
            <div className="w-[82px] shrink-0">
              <Cell
                label={t("defi.revenue24h")}
                value={num(locale, row.revenue24h)}
                tone="brand"
              />
            </div>
            <div className="w-[64px] shrink-0">
              <Cell
                label={t("defi.takeRate")}
                value={
                  row.takeRate == null
                    ? "—"
                    : formatNumber(locale, row.takeRate * 100, {
                        maximumFractionDigits: 0,
                      }) + "%"
                }
              />
            </div>
            <div className="w-[66px] shrink-0">
              <Cell
                label={t("defi.change1d")}
                value={formatSignedPercent(locale, row.change_1d, 1)}
                tone={toneForSign(row.change_1d, 0.1)}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* DEX volume
 * ------------------------------------------------------------------ */

function VolumeView({ data, loading }: { data: VolumeData; loading: boolean }) {
  const { locale, t } = useI18n();
  const rows = useMemo(() => (data?.protocols ?? []).slice(0, 18), [data?.protocols]);

  if (loading && !data) return <Skeleton />;
  if (rows.length === 0) return <Empty message={data?.error ?? ""} />;

  const totals = data?.totals;
  const maxVolume = rows[0]?.volume24h ?? 1;

  return (
    <>
      <StatGrid min={130} className="mb-4">
        <Stat label={t("defi.volume24h")} value={num(locale, totals?.volume24h)} />
        <Stat label={t("defi.volumeAllTime")} value={num(locale, totals?.volumeAllTime)} />
        <Stat
          label={t("defi.change1m")}
          value={formatSignedPercent(locale, totals?.change_1m ?? null, 1)}
          tone={toneForSign(totals?.change_1m, 0.1)}
        />
        <Stat
          label={t("defi.tab.volume")}
          value={formatNumber(locale, rows.length)}
        />
      </StatGrid>

      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div
            key={row.slug ?? row.name}
            className="border-line bg-surface-2/40 flex items-center gap-3 rounded-[10px] border px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <span className="text-fg block truncate text-[12px] font-semibold">
                {row.name}
              </span>
              <div className="mt-1">
                <Meter
                  value={maxVolume > 0 ? (row.volume24h ?? 0) / maxVolume : 0}
                  diverging={false}
                  tone="brand"
                />
              </div>
              <span className="text-fg-3 block truncate text-[10px]">
                {row.chains.slice(0, 4).join(" · ")}
                {row.chains.length > 4 ? ` +${row.chains.length - 4}` : ""}
              </span>
            </div>

            <div className="w-[82px] shrink-0">
              <Cell label={t("defi.volume24h")} value={num(locale, row.volume24h)} />
            </div>
            <div className="w-[78px] shrink-0">
              <Cell label={t("defi.volumeAllTime")} value={num(locale, row.volumeAllTime)} />
            </div>
            <div className="w-[62px] shrink-0">
              <Cell
                label={t("defi.change7d")}
                value={formatSignedPercent(locale, row.change_7d, 1)}
                tone={toneForSign(row.change_7d, 0.1)}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Stablecoins
 * ------------------------------------------------------------------ */

function StablecoinsView({
  data,
  loading,
}: {
  data: StablecoinsData;
  loading: boolean;
}) {
  const { locale, t } = useI18n();
  const assets = useMemo(() => (data?.assets ?? []).slice(0, 12), [data?.assets]);
  const chains = useMemo(() => (data?.chains ?? []).slice(0, 10), [data?.chains]);

  if (loading && !data) return <Skeleton />;
  if (assets.length === 0) return <Empty message={data?.error ?? ""} />;

  const totals = data?.totals;
  const maxSupply = assets[0]?.circulatingUsd ?? 1;

  return (
    <>
      <StatGrid min={130} className="mb-4">
        <Stat label={t("defi.totalSupply")} value={num(locale, totals?.circulatingUsd)} />
        <Stat
          label={t("defi.change1d")}
          value={formatSignedPercent(locale, totals?.change1d ?? null, 2)}
          tone={toneForSign(totals?.change1d, 0.01)}
        />
        <Stat
          label={t("defi.change7d")}
          value={formatSignedPercent(locale, totals?.change7d ?? null, 2)}
          tone={toneForSign(totals?.change7d, 0.01)}
        />
        <Stat
          label={t("defi.change1m")}
          value={formatSignedPercent(locale, totals?.change30d ?? null, 2)}
          tone={toneForSign(totals?.change30d, 0.01)}
        />
      </StatGrid>

      <p className="text-fg-3 mb-3 text-[10px] leading-relaxed">
        {t("defi.stablecoinNote")}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="mb-1">{t("defi.circulating")}</Label>
          {assets.map((row) => (
            <div
              key={row.id}
              className="border-line bg-surface-2/40 flex items-center gap-3 rounded-[10px] border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <span className="text-fg block truncate text-[12px] font-semibold">
                  {row.symbol}
                </span>
                <div className="mt-1">
                  <Meter
                    value={
                      maxSupply > 0 ? (row.circulatingUsd ?? 0) / maxSupply : 0
                    }
                    diverging={false}
                    tone="brand"
                  />
                </div>
              </div>
              <div className="w-[76px] shrink-0">
                <Cell
                  label={t("defi.circulating")}
                  value={num(locale, row.circulatingUsd)}
                />
              </div>
              <div className="w-[58px] shrink-0">
                <Cell
                  label={t("defi.change7d")}
                  value={formatSignedPercent(locale, row.change7d, 2)}
                  tone={toneForSign(row.change7d, 0.02)}
                />
              </div>
              <div className="w-[54px] shrink-0">
                {/*
                  A stablecoin off its peg is the most actionable number on this
                  row, so it is given its own column and a tone rather than buried
                  in a tooltip. A depegged peg is not a rounding error.
                */}
                <Cell
                  label={t("defi.pegDeviation")}
                  value={
                    row.pegDeviation == null
                      ? "—"
                      : formatNumber(locale, row.pegDeviation, {
                          maximumFractionDigits: 2,
                          signDisplay: "exceptZero",
                        }) + "%"
                  }
                  tone={
                    row.pegDeviation === null
                      ? undefined
                      : Math.abs(row.pegDeviation) > 1
                        ? row.pegDeviation > 0
                          ? "up"
                          : "down"
                        : "neutral"
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <Label className="mb-1">{t("defi.chainSupply")}</Label>
          {chains.map((row) => (
            <div
              key={row.chain}
              className="border-line bg-surface-2/40 flex items-center gap-3 rounded-[10px] border px-3 py-2"
            >
              <span className="text-fg min-w-0 flex-1 truncate text-[12px] font-semibold">
                {row.chain}
              </span>
              <div className="w-[76px] shrink-0">
                <Cell label={t("defi.totalSupply")} value={num(locale, row.totalUsd)} />
              </div>
              <div className="w-[58px] shrink-0">
                <Cell
                  label={t("defi.change1m")}
                  value={formatSignedPercent(locale, row.change_1m, 1)}
                  tone={toneForSign(row.change_1m, 0.05)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Exchange reserves
 * ------------------------------------------------------------------ */

function ReservesView({ data, loading }: { data: ReservesData; loading: boolean }) {
  const { locale, t } = useI18n();
  const rows = useMemo(
    () => (data?.exchanges ?? []).slice(0, 16),
    [data?.exchanges],
  );

  if (loading && !data) return <Skeleton />;
  if (rows.length === 0) return <Empty message={data?.error ?? ""} />;

  const totals = data?.totals;

  return (
    <>
      <StatGrid min={130} className="mb-4">
        <Stat label={t("defi.totalReserves")} value={num(locale, totals?.reservesUsd)} />
        <Stat
          label={t("defi.cleanReserves")}
          value={num(locale, totals?.cleanReservesUsd)}
          tone="brand"
        />
        <Stat
          label={t("defi.removed")}
          value={
            totals?.reservesUsd && totals.cleanReservesUsd
              ? formatNumber(
                  locale,
                  ((totals.reservesUsd - totals.cleanReservesUsd) /
                    totals.reservesUsd) *
                    100,
                  { maximumFractionDigits: 1 },
                ) + "%"
              : "—"
          }
        />
        <Stat
          label={t("defi.inflows24h")}
          value={num(locale, totals?.inflows24h)}
          tone={toneForSign(totals?.inflows24h, 0)}
          
        />
      </StatGrid>

      <p className="text-fg-3 mb-2 text-[10px] leading-relaxed">
        {t("defi.reservesNote")}
      </p>

      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div
            key={row.name}
            className="border-line bg-surface-2/40 flex items-center gap-3 rounded-[10px] border px-3 py-2"
          >
            <span className="text-fg min-w-0 flex-1 truncate text-[12px] font-semibold">
              {row.name}
            </span>
            <div className="w-[84px] shrink-0">
              <Cell label={t("defi.reserves")} value={num(locale, row.reservesUsd)} />
            </div>
            <div className="w-[84px] shrink-0">
              <Cell
                label={t("defi.cleanReserves")}
                value={num(locale, row.cleanReservesUsd)}
                tone="brand"
              />
            </div>
            <div className="w-[66px] shrink-0">
              <Cell
                label={t("defi.removed")}
                value={
                  row.cleanRatio == null
                    ? "—"
                    : formatNumber(locale, row.cleanRatio * 100, {
                        maximumFractionDigits: 1,
                      }) + "%"
                }
                tone={row.cleanRatio !== null && row.cleanRatio > 0.1 ? "amber" : undefined}
              />
            </div>
            <div className="w-[74px] shrink-0">
              <Cell
                label={t("defi.inflows24h")}
                value={num(locale, row.inflows24h)}
                tone={toneForSign(row.inflows24h, 0)}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Exploits
 * ------------------------------------------------------------------ */

function HacksView({ data, loading }: { data: HacksData; loading: boolean }) {
  const { locale, t } = useI18n();
  const rows = useMemo(() => (data?.hacks ?? []).slice(0, 20), [data?.hacks]);

  if (loading && !data) return <Skeleton />;
  if (rows.length === 0) return <Empty message={data?.error ?? ""} />;

  const totals = data?.totals;

  return (
    <>
      <StatGrid min={130} className="mb-4">
        <Stat
          label={t("defi.exploitCount")}
          value={formatNumber(locale, totals?.count ?? null)}
          tone="amber"
        />
        <Stat label={t("defi.totalLoss")} value={num(locale, totals?.totalLossUsd)} tone="down" />
        <Stat label={t("defi.largest")} value={num(locale, totals?.largestUsd)} />
        <Stat
          label={t("defi.bridgeExploits")}
          value={formatNumber(locale, totals?.bridgeHacks ?? null)}
        />
      </StatGrid>

      <p className="text-fg-3 mb-2 text-[10px] leading-relaxed">
        {t("defi.netOfReturns")}
      </p>

      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div
            key={`${row.name}-${row.date}`}
            className="border-line bg-surface-2/40 flex items-center gap-3 rounded-[10px] border px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <span className="text-fg block truncate text-[12px] font-semibold">
                {row.name}
              </span>
              <span className="text-fg-3 block truncate text-[10px]">
                {formatDate(locale, row.date * 1000)} · {row.classification ?? "—"}
                {row.chains.length > 0 ? ` · ${row.chains.slice(0, 3).join(", ")}` : ""}
                {row.bridgeHack ? ` · ${t("defi.bridgeExploits")}` : ""}
              </span>
            </div>
            <div className="w-[74px] shrink-0">
              <Cell label={t("defi.loss")} value={num(locale, row.netLossUsd)} tone="down" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Kept so the page can show the fetch time even when a tab is idle. */
export function DefiFetchedAt({ at }: { at: number }) {
  const { locale } = useI18n();
  return <span className="text-fg-3 text-[10px]">{formatRelative(locale, at)}</span>;
}

export { Panel };