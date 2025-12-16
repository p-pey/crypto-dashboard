"use client";

import { Table } from "antd";
import { useEffect, useState } from "react";
import { AppContainer } from "~/lib/container";
import BinanceService from "~/services/binance/BinanceSocketService";
import type { PriceChange } from "~/services/binance/BinanceSocketService.types";
import { api } from "~/trpc/react";
import { columns } from "./CoinDataTable.utils";

const BinanceWebSocketInstance = AppContainer.resolve(BinanceService);
export default function CoinsDataTable() {
  const [LData, setData] = useState<PriceChange[]>([]);
  const { isLoading, data } = api.overview.getPrices.useQuery(undefined, { refetchOnWindowFocus: false, refetchOnMount: true });
  useEffect(() => {
    if (data?.length) {
      BinanceWebSocketInstance.connectToTicker(data, setData);
    }
  }, [isLoading]);
  return (
    <Table
      loading={isLoading}
      dataSource={LData}
      columns={columns}
      expandable={{
        expandedRowRender: (record) => {
          if(record.symbol === "BTC") return null;
          return (
            <span>{`${record.symbol} / BTC = ${record.divideToBTC}`}</span>
          );
        },
      }}
      pagination={false}
    />
  );
}
