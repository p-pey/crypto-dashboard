"use client";

import { Table } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import CoinStatusPanel from "~/features/statuses/CoinStatusPanel";
import { AppContainer } from "~/lib/container";
import BinanceService from "~/services/binance/BinanceSocketService";
import { coinPriceHistory } from "~/services/binance/priceHistory";
import type { PriceChange } from "~/services/binance/BinanceSocketService.types";
import { api } from "~/trpc/react";
import { columns } from "./CoinDataTable.utils";

const BinanceWebSocketInstance = AppContainer.resolve(BinanceService);

export default function CoinsDataTable() {
  const [LData, setLData] = useState<PriceChange[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const { isLoading, data } = api.overview.getPrices.useQuery(undefined, {
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
        if (Number.isFinite(price)) coinPriceHistory.push(row.symbol, price);
        // The mapper hands back stable row objects, so attaching the current
        // window in place keeps the array reference stable for memoised cells
        // and avoids rebuilding 100 objects on every tick.
        row.spark = coinPriceHistory.view(row.symbol);
      }
      setLData(rows);
    });
  }, [data, isLoading]);

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
