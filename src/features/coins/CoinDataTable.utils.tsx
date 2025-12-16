import type { ColumnsType } from "antd/es/table";
import type { PriceChange } from "~/services/binance/BinanceSocketService.types";
import { Avatar } from "antd";

export const columns: ColumnsType<PriceChange> = [
  { title: "#", dataIndex: "order", key: "order", width: 50  },
       { title: "Symbol", dataIndex: "symbol", key: "symbol", render(value, record) {
         return (
           <div key={record.order} style={{ display: "flex", gap:"8px" }}>
             <Avatar size="small" src={record.image} />
             <span>
               { value}
             </span>
           </div>
         )
         } },
       { title: "Price (USDT)", dataIndex: "price", key: "price" },
       { title: "Change USD (24h)", dataIndex: "changeUsd", key: "changeUsd" },
       { title: "Change (24h)", dataIndex: "change", key: "change" },
];