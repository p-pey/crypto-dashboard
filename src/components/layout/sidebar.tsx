"use client";
import {
  BarChartOutlined,
  LineChartOutlined,
  PieChartOutlined,
} from "@ant-design/icons";
import { Menu } from "antd";
import type { ItemType, MenuItemType } from "antd/es/menu/interface";
import { usePathname, useRouter } from "next/navigation";

``;

export default function AppSidebar() {
  const navigate = useRouter();
  const pathname = usePathname();
  const tabs = pathname.split("/");
  const currentTab = tabs[tabs.length - 1];
  console.log(currentTab);
  const items: ItemType<MenuItemType>[] = [
    {
      key: "dashboard",
      icon: <PieChartOutlined />,
      label: "Dashboard",
      onClick: () => navigate.push("/"),
    },
    {
      key: "etfs",
      icon: <LineChartOutlined />,
      label: "ETFs",
      onClick: () => navigate.push("/etfs"),
    },
    {
      key: "liquidity",
      icon: <BarChartOutlined />,
      label: "Liquidity",
      onClick: () => navigate.push("/liquidity"),
    },
  ];
  const activeTab = items.find((item) => item?.key === currentTab);

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
        defaultSelectedKeys={["dashboard"]}
        selectedKeys={activeTab ? [activeTab.key as string] : undefined}
        items={items}
      />
    </div>
  );
}
