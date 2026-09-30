"use client";

import { Table } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import CoinStatusPanel from "~/features/statuses/CoinStatusPanel";
import { AppContainer } from "~/lib/container";
import BinanceService from "~/services/binance/BinanceSocketService";
import { coinPriceHistory } from "~/services/binance/priceHistory";
import type { PriceChange } from "~/services/binance/BinanceSocketService.types";
import UpdatedStamp from "~/components/shared/UpdatedStamp";
import { useAlerts } from "~/providers/AlertProvider";
import { useI18n } from "~/i18n/I18nProvider";
import { api } from "~/trpc/react";
import { useCoinColumns } from "./CoinDataTable.utils";

const BinanceWebSocketInstance = AppContainer.resolve(BinanceService);

export default function CoinsDataTable() {
  const { t } = useI18n();
  const { watch } = useAlerts();
  const [LData, setLData] = useState<PriceChange[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const { isLoading, data, dataUpdatedAt, isFetching } =
    api.overview.getPrices.useQuery(undefined, {
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    });

  useEffect(() => {
    if (!data?.length) return;

    // Seed the sparkline from CoinGecko's 7 day series so the trend is drawn
    // immediately, then keep appending live Binance ticks.
    for (const coin of data) {
      coinPriceHistory.seed(
        String(coin.symbol).toUpperCase(),
        coin.sparkline_in_7d?.price,
      );
    }

    BinanceWebSocketInstance.connectToTicker(data, (rows) => {
      for (const row of rows) {
        const price = Number(row.price);
        if (Number.isFinite(price)) {
          coinPriceHistory.push(row.symbol, price);
          // Every live tick is offered to the pump/dump detector, which decides
          // on its own whether the move was large enough to be worth a noise.
          watch(row.symbol, row.symbol, price);
        }
        // The mapper hands back stable row objects, so attaching the current
        // window in place keeps the array reference stable for memoised cells
        // and avoids rebuilding 100 objects on every tick.
        row.spark = coinPriceHistory.view(row.symbol);
      }
      setLData(rows);
    });
  }, [data, isLoading, watch]);

  const columns = useCoinColumns(dataUpdatedAt || null);

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }, []);

  /**
   * Paint the verdict badge next to each coin using whatever the server already
   * has cached, so opening a row is instant on the second visit.
   */
  const { data: cached } = api.statuses.listCached.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const verdicts = useMemo(
    () =>
      Object.fromEntries(
        (cached?.statuses ?? []).map((status) => [
          status.coinId,
          { verdict: status.verdict, score: status.score },
        ]),
      ),
    [cached],
  );

  const rows = useMemo(
    () =>
      LData.map((coin) => {
        const verdict = coin.id ? verdicts[coin.id] : undefined;
        return {
          ...coin,
          expandStatus: expandedKeys.includes(coin.key),
          onToggleExpand: toggleExpand,
          statusVerdict: verdict?.verdict,
          statusScore: verdict?.score,
        };
      }),
    [LData, expandedKeys, toggleExpand, verdicts],
  );

  return (
    <Table
      loading={isLoading}
      // A live websocket keeps the rows moving between REST refreshes, so the
      // fetch time is stamped separately from the last tick.
      title={() => (
        <UpdatedStamp
          at={dataUpdatedAt || null}
          label={isFetching ? t("markets.refreshing") : undefined}
          refreshing={isFetching}
        />
      )}
      dataSource={rows}
      columns={columns}
      expandable={{
        expandedRowKeys: expandedKeys,
        // The "+" button drives expansion, so hide antd's own caret column.
        expandIcon: () => null,
        onExpandedRowsChange: (keys) => setExpandedKeys([...keys]),
        expandedRowRender: (record) => (
          <CoinStatusPanel
            coinId={record.id}
            symbol={record.symbol}
            name={record.name}
          />
        ),
      }}
      pagination={false}
    />
  );
}
