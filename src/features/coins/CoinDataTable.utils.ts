import type { ColumnsType } from "antd/es/table";
import type { PriceChange } from "~/services/binance/BinanceSocketService.types";

export const columns: ColumnsType<PriceChange> = [
       { title: "Symbol", dataIndex: "symbol", key: "symbol", className: "text-error" },
       { title: "Price (USDT)", dataIndex: "price", key: "price", className: "text-error" },
       { title: "Change ( USD )", dataIndex: "changeUsd", key: "changeUsd", className: "text-error" },
       { title: "Change (%)", dataIndex: "change", key: "change", className: "text-error" },
];