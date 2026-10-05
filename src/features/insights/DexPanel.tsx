"use client";

import { Input, Segmented } from "antd";
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
import {
  formatCompact,
  formatNumber,
  formatRelative,
  formatSignedPercent,
} from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { api, type RouterOutputs } from "~/trpc/react";

const EASE = [0.16, 1, 0.3, 1] as const;

type Tab = "pools" | "arbitrage";

/**
 * DEX markets and cross-pool spreads, from DexScreener and GeckoTerminal.
 *
 * The arbitrage view is the reason this is worth building here rather than as
 * part of the existing CEX arbitrage panel: **it needs no credential and no
 * order-book connection.** One search returns the same token quoted across every
 * pool that lists it, with liquidity attached, so comparing the best price
 * against the worst *is* the data.
 *
 * What makes that comparison correct rather than merely impressive is the join
 * key. Pools are matched on **contract address within a chain**, never on ticker
 * — a live `PEPE` search returns the real PEPE on Ethereum alongside unrelated
 * tokens on Base and Solana whose developers borrowed the ticker, and comparing
 * those produces "spreads" of several thousand percent that are entirely fake.
 * The spread panel therefore only ever compares two pools holding the same
 * contract on the same chain, which is the only case where a spread is actionable.
 */
export default function DexPanel() {
  const { locale, t } = useI18n();
  const [tab, setTab] = useState<Tab>("pools");
  const [term, setTerm] = useState("WETH");

  const board = api.insights.dexBoard.useQuery(
    {},
    { staleTime: 2 * 60_000, refetchInterval: 5 * 60_000, retry: false },
  );

  // Deliberately not `enabled: Boolean(term)`-gated on every keystroke: the
  // search only fires on submit, so typing does not spend DexScreener's
  // 300-requests-per-minute allowance one prefix at a time.
  const [submitted, setSubmitted] = useState("WETH");
  const search = api.insights.dexSearch.useQuery(
    { query: submitted },
    { staleTime: 2 * 60_000, refetchInterval: 5 * 60_000, retry: false },
  );

  const pairs = useMemo(
    () => (search.data?.pairs ?? []).slice(0, 20),
    [search.data?.pairs],
  );
  const spreads = useMemo(
    () => (search.data?.arbitrage ?? []).slice(0, 12),
    [search.data?.arbitrage],
  );

  const maxLiquidity = pairs[0]?.liquidityUsd ?? 1;

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
            {t("dex.title")}
          </h2>
          <p className="text-fg-3 mt-0.5 max-w-2xl text-[11px] leading-relaxed">
            {t("dex.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input.Search
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onSearch={(value) => {
              const next = value.trim().toUpperCase();
              if (next.length > 0) setSubmitted(next);
            }}
            placeholder={t("dex.searchPlaceholder")}
            enterButton={t("dex.searchPlaceholder")}
            size="small"
            style={{ width: 230 }}
            allowClear
          />
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            size="small"
            options={[
              { value: "pools", label: t("dex.tab.pools") },
              { value: "arbitrage", label: t("dex.tab.arbitrage") },
            ]}
          />
        </div>
      </header>

      {tab === "pools" ? (
        <PoolsTab
          pools={pairs}
          loading={search.isLoading}
          boardPairs={board.data?.pairs.length ?? 0}
          boardVolume={board.data?.totals.volume24h ?? null}
          poolCount={search.data?.poolCount ?? 0}
          maxLiquidity={maxLiquidity}
          updatedAt={search.dataUpdatedAt}
          error={search.data?.error ?? null}
        />
      ) : (
        <SpreadsTab
          spreads={spreads}
          loading={search.isLoading}
          symbol={submitted}
          poolCount={search.data?.poolCount ?? 0}
          updatedAt={search.dataUpdatedAt}
        />
      )}
    </motion.section>
  );
}

/**
 * Router output aliases rather than `ReturnType<typeof useQuery>`, because the
 * latter resolves to `{}` without a generic argument and silently loses every
 * field. Deriving them from the router keeps the two in step automatically.
 */
type SearchData = RouterOutputs["insights"]["dexSearch"];
type Pair = SearchData["pairs"][number];
type Spread = SearchData["arbitrage"][number];

function PoolsTab({
  pools,
  loading,
  boardPairs,
  boardVolume,
  poolCount,
  maxLiquidity,
  updatedAt,
  error,
}: {
  pools: Pair[];
  loading: boolean;
  boardPairs: number;
  boardVolume: number | null;
  poolCount: number;
  maxLiquidity: number;
  updatedAt: number;
  error: string | null;
}) {
  const { locale, t } = useI18n();

  if (loading && pools.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="bg-surface-3 h-[46px] animate-pulse rounded-[10px]" />
        ))}
      </div>
    );
  }

  return (
    <>
      <StatGrid min={130} className="mb-4">
        <Stat
          label={t("dex.poolsFound")}
          value={formatNumber(locale, poolCount)}
        />
        <Stat
          label={t("dex.liquidity")}
          value={formatCompact(locale, pools[0]?.liquidityUsd)}
          hint={pools[0]?.baseSymbol}
        />
        <Stat
          label={t("dex.volume")}
          value={formatCompact(locale, boardVolume)}
          hint={`${t("dex.tab.pools")}: ${formatNumber(locale, boardPairs)}`}
        />
        <Stat
          label={t("dex.chainsFound")}
          value={formatNumber(locale, new Set(pools.map((p) => p.chain)).size)}
        />
      </StatGrid>

      {pools.length === 0 ? (
        <PanelBox>
          <p className="text-fg-3 text-[11px]">{error ?? t("dex.noPools")}</p>
        </PanelBox>
      ) : (
        <div className="flex flex-col gap-1">
          {pools.map((pair) => (
            <PoolRow key={pair.pairId} pool={pair} maxLiquidity={maxLiquidity} />
          ))}
        </div>
      )}

      {updatedAt > 0 && (
        <p className="text-fg-3 mt-2 text-[10px]">
          {formatRelative(locale, updatedAt)}
        </p>
      )}
    </>
  );
}

function PoolRow({ pool, maxLiquidity }: { pool: Pair; maxLiquidity: number }) {
  const { locale, t } = useI18n();

  return (
    <div className="border-line bg-surface-2/40 flex items-center gap-3 rounded-[10px] border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-fg text-[12px] font-bold">
            {pool.baseSymbol}
          </span>
          <span className="text-fg-3 text-[10px]">/ {pool.quoteSymbol}</span>
          <Pill tone="muted" size="sm">
            {pool.dex}
          </Pill>
          <Pill tone="cyan" size="sm">
            {pool.chain}
          </Pill>
        </div>
        <div className="mt-1">
          <Meter
            value={maxLiquidity > 0 ? (pool.liquidityUsd ?? 0) / maxLiquidity : 0}
            diverging={false}
            tone="brand"
          />
        </div>
      </div>

      <div className="w-[86px] shrink-0 text-end">
        <Label>{t("dex.price")}</Label>
        <span
          dir="ltr"
          className="num text-fg block text-[12px] font-bold tabular-nums"
        >
          {formatCompact(locale, pool.priceUsd)}
        </span>
      </div>

      <div className="w-[78px] shrink-0 text-end">
        <Label>{t("dex.liquidity")}</Label>
        <span
          dir="ltr"
          className="num text-fg-2 block text-[12px] font-bold tabular-nums"
        >
          {formatCompact(locale, pool.liquidityUsd)}
        </span>
      </div>

      <div className="w-[74px] shrink-0 text-end">
        <Label>{t("dex.turnover")}</Label>
        <span
          dir="ltr"
          className="num text-fg-2 block text-[12px] font-bold tabular-nums"
        >
          {pool.volumeToLiquidity == null
            ? "—"
            : formatNumber(locale, pool.volumeToLiquidity, {
                maximumFractionDigits: 2,
              }) + "x"}
        </span>
      </div>

      <div className="w-[62px] shrink-0 text-end">
        <Label tone={toneForSign(pool.change24h, 0.5)}>{t("dex.change")}</Label>
        <span
          dir="ltr"
          className="num block text-[12px] font-bold tabular-nums"
          style={{
            color:
              pool.change24h === null
                ? "var(--text-3)"
                : `var(--${pool.change24h > 0.5 ? "up" : pool.change24h < -0.5 ? "down" : "text-2"})`,
          }}
        >
          {formatSignedPercent(locale, pool.change24h, 1)}
        </span>
      </div>
    </div>
  );
}

function SpreadsTab({
  spreads,
  loading,
  symbol,
  poolCount,
  updatedAt,
}: {
  spreads: Spread[];
  loading: boolean;
  symbol: string;
  poolCount: number;
  updatedAt: number;
}) {
  const { locale, t } = useI18n();

  /**
   * Only spreads that survive the fee floor are marked actionable, and the
   * panel is explicit when *nothing* does. Most real rows are below 0.6% gross
   * and therefore negative after fees — that is arbitrage working correctly, and
   * presenting those rows as opportunities would be the misleading choice.
   */
  const actionable = spreads.filter((row) => (row.netSpreadPercent ?? 0) > 0);

  if (loading && spreads.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="bg-surface-3 h-[52px] animate-pulse rounded-[10px]" />
        ))}
      </div>
    );
  }

  return (
    <>
      <StatGrid min={130} className="mb-4">
        <Stat label={t("dex.poolsFound")} value={formatNumber(locale, poolCount)} />
        <Stat
          label={t("dex.tab.arbitrage")}
          value={formatNumber(locale, spreads.length)}
        />
        <Stat
          label={t("dex.netSpread")}
          value={
            spreads[0]?.netSpreadPercent == null
              ? "—"
              : formatNumber(locale, spreads[0].netSpreadPercent, {
                  maximumFractionDigits: 2,
                  signDisplay: "exceptZero",
                }) + "%"
          }
          tone={toneForSign(spreads[0]?.netSpreadPercent ?? null, 0)}
          hint={symbol}
        />
      </StatGrid>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-fg-3 max-w-2xl text-[10px] leading-relaxed">
          {t("dex.symbolNote")}
        </p>
        <Pill tone="muted" size="sm">
          {t("dex.feesNote")}
        </Pill>
      </div>

      {spreads.length === 0 ? (
        <PanelBox>
          <p className="text-fg-3 text-[11px]">{t("dex.noSpreads")}</p>
        </PanelBox>
      ) : (
        <div className="flex flex-col gap-1">
          {spreads.map((row) => {
            const net = row.netSpreadPercent ?? 0;
            const live = net > 0;

            return (
              <div
                key={`${row.buy.pairId}-${row.sell.pairId}`}
                className={`flex items-center gap-3 rounded-[10px] border px-3 py-2 ${
                  live
                    ? "border-up/25 bg-up/5"
                    : "border-line bg-surface-2/40"
                }`}
              >
                <div className="w-[64px] shrink-0">
                  <span className="text-fg text-[12.5px] font-bold">
                    {row.symbol}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[10.5px]">
                    <span className="text-fg-3">{t("dex.buyAt")}</span>
                    <span className="text-fg font-bold">
                      {formatCompact(locale, row.buy.priceUsd)}
                    </span>
                    <Pill tone="muted" size="sm">
                      {row.buy.dex} · {row.buy.chain}
                    </Pill>
                    <span className="text-fg-3 ms-1">{t("dex.sellAt")}</span>
                    <span className="text-fg font-bold">
                      {formatCompact(locale, row.sell.priceUsd)}
                    </span>
                    <Pill tone="muted" size="sm">
                      {row.sell.dex} · {row.sell.chain}
                    </Pill>
                  </div>
                </div>

                <div className="w-[74px] shrink-0 text-end">
                  <Label>{t("dex.grossSpread")}</Label>
                  <span className="num text-fg-2 block text-[12px] font-bold tabular-nums">
                    {formatNumber(locale, row.grossSpreadPercent, {
                      maximumFractionDigits: 2,
                    })}
                    %
                  </span>
                </div>

                <div className="w-[74px] shrink-0 text-end">
                  <Label tone={live ? "up" : "down"}>{t("dex.netSpread")}</Label>
                  <span
                    dir="ltr"
                    className="num block text-[12px] font-extrabold tabular-nums"
                    style={{ color: live ? "var(--up)" : "var(--text-2)" }}
                  >
                    {formatNumber(locale, net, {
                      maximumFractionDigits: 2,
                      signDisplay: "exceptZero",
                    })}
                    %
                  </span>
                </div>

                <div className="w-[72px] shrink-0 text-end">
                  <Label>{t("dex.minLiquidity")}</Label>
                  <span className="num text-fg-2 block text-[12px] font-bold tabular-nums">
                    {formatCompact(locale, row.minLiquidityUsd)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {actionable.length === 0 && spreads.length > 0 && (
        <p className="text-fg-3 mt-2 text-[10px]">{t("dex.noSpreads")}</p>
      )}

      {updatedAt > 0 && (
        <p className="text-fg-3 mt-2 text-[10px]">
          {formatRelative(locale, updatedAt)}
        </p>
      )}
    </>
  );
}