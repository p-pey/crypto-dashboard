import type { ColumnsType } from "antd/es/table";
import type { PriceChange } from "~/services/binance/BinanceSocketService.types";

export const columns: ColumnsType<PriceChange> = [
  { title: "#", dataIndex: "order", key: "order", width: 50  },
       { title: "Symbol", dataIndex: "symbol", key: "symbol" },
       { title: "Price (USDT)", dataIndex: "price", key: "price" },
       { title: "Change ( USD )", dataIndex: "changeUsd", key: "changeUsd" },
       { title: "Change (%)", dataIndex: "change", key: "change" },
];