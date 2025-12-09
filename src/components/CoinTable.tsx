"use client";

import { mockCoins } from "@/data/mockData";
import { Coin } from "@/types/crypto";
import { formatCurrency, formatPercent, formatSupply } from "@/utils/format";
import {
  CaretDownOutlined,
  CaretUpOutlined,
  SearchOutlined,
  StarFilled,
  StarOutlined,
} from "@ant-design/icons";
import { Input, Select, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import SparklineChart from "./SparklineChart";

const CoinTable = () => {
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState("market_cap");

  const toggleWatchlist = (id: string) => {
    setWatchlist((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const renderChange = (value: number) => {
    const isPositive = value >= 0;
    return (
      <span
        className={`flex items-center gap-1 ${
          isPositive ? "text-gain" : "text-loss"
        }`}
      >
        {isPositive ? <CaretUpOutlined /> : <CaretDownOutlined />}
        {formatPercent(value).replace("+", "")}
      </span>
    );
  };

  const columns: ColumnsType<Coin> = [
    {
      title: "",
      dataIndex: "id",
      key: "watchlist",
      width: 40,
      render: (id: string) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleWatchlist(id);
          }}
          className="text-muted-foreground hover:text-warning transition-colors"
        >
          {watchlist.has(id) ? (
            <StarFilled className="text-warning" />
          ) : (
            <StarOutlined />
          )}
        </button>
      ),
    },
    {
      title: "#",
      dataIndex: "rank",
      key: "rank",
      width: 60,
      sorter: (a, b) => a.rank - b.rank,
    },
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      width: 200,
      render: (_, record) => (
        <div className="flex items-center gap-3">
          <img
            src={record.logo}
            alt={record.name}
            className="w-8 h-8 rounded-full"
            onError={(e) => {
              (
                e.target as HTMLImageElement
              ).src = `https://ui-avatars.com/api/?name=${record.symbol}&background=random`;
            }}
          />
          <div>
            <div className="font-medium text-foreground">{record.name}</div>
            <div className="text-xs text-muted-foreground">{record.symbol}</div>
          </div>
        </div>
      ),
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: "Price",
      dataIndex: "price",
      key: "price",
      width: 120,
      render: (price: number) => (
        <span className="font-medium text-foreground">
          {formatCurrency(price)}
        </span>
      ),
      sorter: (a, b) => a.price - b.price,
    },
    {
      title: "1h %",
      dataIndex: "change1h",
      key: "change1h",
      width: 100,
      render: renderChange,
      sorter: (a, b) => a.change1h - b.change1h,
    },
    {
      title: "24h %",
      dataIndex: "change24h",
      key: "change24h",
      width: 100,
      render: renderChange,
      sorter: (a, b) => a.change24h - b.change24h,
    },
    {
      title: "7d %",
      dataIndex: "change7d",
      key: "change7d",
      width: 100,
      render: renderChange,
      sorter: (a, b) => a.change7d - b.change7d,
    },
    {
      title: "Market Cap",
      dataIndex: "marketCap",
      key: "marketCap",
      width: 140,
      render: (value: number) => formatCurrency(value),
      sorter: (a, b) => a.marketCap - b.marketCap,
    },
    {
      title: "Volume(24h)",
      dataIndex: "volume24h",
      key: "volume24h",
      width: 140,
      render: (value: number) => formatCurrency(value),
      sorter: (a, b) => a.volume24h - b.volume24h,
    },
    {
      title: "Circulating Supply",
      dataIndex: "circulatingSupply",
      key: "circulatingSupply",
      width: 160,
      render: (value: number, record) => formatSupply(value, record.symbol),
    },
    {
      title: "Last 7 Days",
      dataIndex: "sparklineData",
      key: "sparkline",
      width: 140,
      render: (data: number[], record) => (
        <SparklineChart
          data={data}
          color={record.change7d >= 0 ? "gain" : "loss"}
          width={120}
          height={40}
        />
      ),
    },
  ];

  const filteredCoins = mockCoins.filter(
    (coin) =>
      coin.name.toLowerCase().includes(searchText.toLowerCase()) ||
      coin.symbol.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
      <div className="p-4 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-xl font-semibold text-foreground">
            Today's Cryptocurrency Prices by Market Cap
          </h2>
          <div className="flex items-center gap-3">
            <Input
              prefix={<SearchOutlined className="text-muted-foreground" />}
              placeholder="Search coins"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-48"
            />
            <Select
              defaultValue="market_cap"
              onChange={setSortBy}
              options={[
                { value: "market_cap", label: "Market Cap" },
                { value: "volume", label: "Volume" },
                { value: "price", label: "Price" },
                { value: "change_24h", label: "24h Change" },
              ]}
              className="w-32"
            />
          </div>
        </div>
      </div>
      <Table
        columns={columns}
        dataSource={filteredCoins}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ["10", "25", "50", "100"],
        }}
        scroll={{ x: 1200 }}
        className="crypto-table"
        rowClassName="hover:bg-secondary/50 cursor-pointer transition-colors"
      />
    </div>
  );
};

export default CoinTable;
