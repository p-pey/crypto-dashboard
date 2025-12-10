"use client";

import { Table } from "antd";
import { useEffect, useState } from "react";
import { AppContainer } from "~/lib/container";
import BinanceService from "~/services/binance/BinanceSocketService";

const BinanceWebSocketInstance = AppContainer.resolve(BinanceService);
export default function CoinsDataTable() {
  const [data, setData] = useState([]);

  useEffect(() => {
    const handleUpdate = (prices) => {
      console.log(prices);
      const formatted = prices.map((p, index) => ({
        key: index,
        symbol: p.s.replace("USDT", ""),
        price: parseFloat(p.c).toFixed(4),
        volume: parseFloat(p.q).toFixed(2),
        change: parseFloat(p.P).toFixed(2) + "%",
      }));
      setData(formatted);
    };

    BinanceWebSocketInstance.connectToTicker(handleUpdate);
  }, []);
  //const coins = api.overview.getPrices.useQuery();
  const columns = [
    { title: "Symbol", dataIndex: "symbol", key: "symbol" },
    { title: "Price (USDT)", dataIndex: "price", key: "price" },
    { title: "24h Volume", dataIndex: "volume", key: "volume" },
    { title: "Change (%)", dataIndex: "change", key: "change" },
  ];
  return <Table dataSource={data} columns={columns} pagination={false} />;
}
