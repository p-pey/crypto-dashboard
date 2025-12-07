"use client";

import { Table } from "antd";
import { api } from "~/trpc/react";


export default function CoinsDataTable() {
  const coins = api.overview.getPrices.useQuery();
  console.log(coins)
  return (
    <Table dataSource={[]} />
  )
}