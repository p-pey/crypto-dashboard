"use client";

import { motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import UpdatedStamp from "~/components/shared/UpdatedStamp";
import { AppContainer } from "~/lib/container";
import { useI18n } from "~/i18n/I18nProvider";
import { CoinStore } from "~/services/coins/CoinStore";
import { CoinStream } from "~/services/coins/CoinStream";
import type { CoinSortKey } from "~/services/coins/coin.types";
import type { StatusVerdict } from "~/services/statuses/statuses.types";
import { api } from "~/trpc/react";
import { useAlerts } from "~/providers/AlertProvider";
import CoinRowList from "./CoinRowList";

const EASE = [0.16, 1, 0.3, 1] as const;

const Store = AppContainer.resolve(CoinStore);
const Stream = AppContainer.resolve(CoinStream);

/**
 * The markets screen.
 *
 * Owns exactly three things: fetching the fundamentals, wiring the websocket, and
 * holding the sort. Everything else - ordering, tick application, change
 * detection - belongs to the store, because it has to be right for the table's
 * memoisation to work at all and that is not a view concern.
 *
 * The subscription uses `useSyncExternalStore` rather than a `useState` set from
 * a listener. That matters under a fast feed: `useSyncExternalStore` guarantees
 * the component re-reads the store itself, so a burst of ticks that lands between
 * render and paint cannot leave the screen showing a stale snapshot.
 */

/** CoinGecko allows only a few calls a minute; a longer window is friendlier. */
const REFRESH_MS = 120_000;

export default function CoinsDataTable() {
  const { t } = useI18n();
  const { watch } = useAlerts();

  const [sortKey, setSortKey] = useState<CoinSortKey | null>("marketCap");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const { data, isLoading, dataUpdatedAt, isFetching } =
    api.overview.getPrices.useQuery(undefined, {
      refetchOnWindowFocus: false,
      refetchInterval: REFRESH_MS,
    });

  /**
   * Seeds the fundamentals into the store.
   *
   * In an effect rather than during render, because writing to an external store
   * while rendering would mean a render can have side effects - which React is
   * entitled to run twice, and a double seed would be two notifications.
   *
   * The store is idempotent per row, so a re-run costs a comparison and nothing
   * else. The empty state is covered by the `loading` flag on the list, so there
   * is no visible flash while this runs.
   */
  useEffect(() => {
    if (!data || data.length === 0) return;
    Store.seed(data);
  }, [data]);

  const rows = useSyncExternalStore(
    useCallback((listener: () => void) => Store.subscribe(listener), []),
    useCallback(() => Store.snapshot(), []),
    // React requires this for any store read while server-rendering, and
    // without it the whole page fails with `Missing getServerSnapshot` and a
    // 500 rather than falling back. The snapshot is process-local and empty at
    // boot, so it is genuinely the same value the server would see.
    useCallback(() => Store.snapshot(), []),
  );

  /**
   * The socket is opened once the fundamentals are in, because the stream URL is
   * built from those symbols and subscribing to nothing would connect in vain.
   */
  useEffect(() => {
    if (!data || data.length === 0) return;
    const pairs = data.map((coin) => coin.symbol);
    return Stream.connect(pairs, (tick) => {
      const price = Number.parseFloat(tick.c);
      if (Number.isFinite(price)) {
        // Every live tick is offered to the move detector, which decides on its
        // own whether the move was worth a sound.
        watch(tick.s, tick.s, price);
      }
    });
  }, [data, watch]);

  const onSort = useCallback((key: CoinSortKey) => {
    // Mirrors the store's own three-state cycle, kept in component state so the
    // header can show which column is active without asking the store to
    // re-notify.
    setSortKey((currentKey) => {
      if (currentKey !== key) {
        setSortDirection(key === "rank" ? "asc" : "desc");
        return key;
      }
      setSortDirection((dir) => {
        if (dir === "asc") return "desc";
        // The third click restores the default rather than stalling at desc.
        setSortKey(null);
        return "desc";
      });
      return currentKey;
    });
    Store.toggleSort(key);
  }, []);

  /**
   * Cached status verdicts, painted inline on the row.
   *
   * Read from whatever the server already has so opening a row is instant on a
   * second visit instead of re-running the analysis.
   */
  const { data: cached } = api.statuses.listCached.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const verdicts = useMemo(() => {
    const out: Record<string, { verdict: StatusVerdict; score: number }> = {};
    for (const status of cached?.statuses ?? []) {
      out[status.coinId] = { verdict: status.verdict, score: status.score };
    }
    return out;
  }, [cached]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="panel px-4 py-4"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-fg text-[15px] font-bold tracking-tight">
            {t("markets.spotMarkets")}
          </h2>
          <p className="text-fg-3 text-[12px]">
            {t("markets.spotMarketsHint")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-fg-3 text-[10.5px]">
            {t("markets.showing")
              .replace("%s", String(rows.length))
              .replace("%s", String(rows.length))}
          </span>
          <UpdatedStamp
            at={dataUpdatedAt || null}
            label={isFetching ? t("markets.refreshing") : undefined}
            refreshing={isFetching}
          />
        </div>
      </header>

      <CoinRowList
        rows={rows}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={onSort}
        verdicts={verdicts}
        loading={isLoading}
        emptyLabel={t("markets.waitingFirstTick")}
      />
    </motion.section>
  );
}
