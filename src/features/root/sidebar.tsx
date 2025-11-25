"use client";
import { Menu } from "antd";
import {
  PieChartOutlined,
  LineChartOutlined,
  BarChartOutlined,
  SettingOutlined,
} from "@ant-design/icons";

const items = [
  { key: "1", icon: <PieChartOutlined />, label: "Dashboard" },
  { key: "2", icon: <LineChartOutlined />, label: "ETFs" },
  { key: "3", icon: <BarChartOutlined />, label: "Liquidity" },
  { key: "4", icon: <SettingOutlined />, label: "Settings" },
];

export default function AppSidebar() {
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
