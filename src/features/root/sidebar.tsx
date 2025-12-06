"use client";
import { Menu } from "antd";
import {
  PieChartOutlined,
  LineChartOutlined,
  BarChartOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import type {ItemType, MenuItemType} from "antd/es/menu/interface";
import {useRouter} from "next/navigation";

``

export default function AppSidebar() {
    const navigate = useRouter();
    const items: ItemType<MenuItemType>[] = [
        { key: "1", icon: <PieChartOutlined />, label: "Dashboard", onClick:()=> navigate.push("/")  },
        { key: "2", icon: <LineChartOutlined />, label: "ETFs", onClick:()=> navigate.push("/etfs")  },
        { key: "3", icon: <BarChartOutlined />, label: "Liquidity", onClick: ()=> navigate.push("/liquidity")  },
    ];
  return (
    <div style={{ height: "100%", background: "#001529" }}>
      <div
        style={{ color: "white", padding: 16, fontWeight: 600, fontSize: 18 }}
      >
        Crypto Dashboard
      </div>
      <Menu
        theme="dark"
        mode="inline"
        defaultSelectedKeys={["1"]}
        items={items}
      />
    </div>
  );
}
