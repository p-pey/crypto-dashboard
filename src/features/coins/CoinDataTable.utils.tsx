"use client";

import type { ColumnsType } from "antd/es/table";
import { Avatar, Button, Tag, Tooltip } from "antd";
import Sparkline from "~/features/shared/Sparkline";
import type { PriceChange } from "~/services/binance/BinanceSocketService.types";
import type { StatusVerdict } from "~/services/statuses/statuses.types";

export const VERDICT_TAG: Record<
  StatusVerdict,
  { label: string; color: string }
> = {
  strong_buy: { label: "Strong Buy", color: "#00b894" },
  buy: { label: "Buy", color: "#7bed9f" },
  neutral: { label: "Hold", color: "#95a5a6" },
  reduce: { label: "Reduce", color: "#fdcb6e" },
  avoid: { label: "Avoid", color: "#d63031" },
};

export const columns: ColumnsType<PriceChange> = [
  { title: "#", dataIndex: "order", key: "order", width: 50 },
  {
    title: "Symbol",
    dataIndex: "symbol",
    key: "symbol",
    render(value: string, record: PriceChange) {
      return (
        <div
          key={record.order}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <Button
            size="small"
            type="text"
            aria-label={record.expandStatus ? "Hide status" : "Show status"}
            aria-expanded={record.expandStatus ?? false}
            data-testid={`status-toggle-${value}`}
            onClick={(event) => {
              event.stopPropagation();
              record.onToggleExpand?.(record.key);
            }}
            style={{
              minWidth: 22,
              height: 22,
              padding: 0,
              fontSize: 16,
              lineHeight: 1,
              fontWeight: 700,
            }}
          >
            {record.expandStatus ? "−" : "+"}
          </Button>
          <Avatar size="small" src={record.image} />
          <span>{value}</span>
          {record.statusVerdict && (
            <Tooltip
              title={`Status score ${record.statusScore ?? 0} - click + for the full analysis`}
            >
              <Tag
                color={VERDICT_TAG[record.statusVerdict].color}
                style={{ marginInlineEnd: 0 }}
              >
                {VERDICT_TAG[record.statusVerdict].label}
              </Tag>
            </Tooltip>
          )}
        </div>
      );
    },
  },
  { title: "Price (USDT)", dataIndex: "price", key: "price" },
  {
    title: "Trend",
    dataIndex: "spark",
    key: "spark",
    width: 130,
    render: (spark: number[] | undefined) => (
      <Tooltip title="Seeded from the CoinGecko 7 day series, then extended with live Binance ticks">
        <Sparkline values={spark} width={104} height={26} />
      </Tooltip>
    ),
  },
  { title: "Change USD (24h)", dataIndex: "changeUsd", key: "changeUsd" },
  { title: "Change (24h)", dataIndex: "change", key: "change" },
];
