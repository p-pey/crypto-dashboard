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
  const { isLoading, data } = api.overview.getPrices.useQuery();
  useEffect(() => {
    if (data) {
      BinanceWebSocketInstance.connectToTicker(setData, data);
    }
  }, [data]);
  return (
    <Table
      loading={isLoading}
      dataSource={LData}
      columns={columns}
      pagination={false}
    />
  );
}
