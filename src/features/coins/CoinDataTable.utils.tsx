"use client";

import type { ColumnsType } from "antd/es/table";
import { Avatar, Button, Tag, Tooltip } from "antd";
import { useMemo } from "react";
import FlashValue from "~/components/shared/FlashValue";
import Sparkline from "~/features/shared/Sparkline";
import UpdatedStamp from "~/components/shared/UpdatedStamp";
import { useI18n } from "~/i18n/I18nProvider";
import type { PriceChange } from "~/services/binance/BinanceSocketService.types";
import type { StatusVerdict } from "~/services/statuses/statuses.types";

/** Tag colours are theme independent, so they live outside the dictionary. */
export const VERDICT_COLOR: Record<StatusVerdict, string> = {
  strong_buy: "#00b894",
  buy: "#7bed9f",
  neutral: "#95a5a6",
  reduce: "#fdcb6e",
  avoid: "#d63031",
};

export function useCoinColumns(
  updatedAt: number | null,
): ColumnsType<PriceChange> {
  const { t } = useI18n();

  return useMemo<ColumnsType<PriceChange>>(
    () => [
      {
        title: t("markets.columns.order"),
        dataIndex: "order",
        key: "order",
        width: 50,
      },
      {
        title: t("markets.columns.symbol"),
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
                aria-label={
                  record.expandStatus
                    ? t("markets.expand.hide")
                    : t("markets.expand.show")
                }
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
              <span dir="ltr">{value}</span>
              {record.statusVerdict && (
                <Tooltip
                  title={t(
                    "markets.expand.tooltip",
                    String(record.statusScore ?? 0),
                  )}
                >
                  <Tag
                    color={VERDICT_COLOR[record.statusVerdict]}
                    style={{ marginInlineEnd: 0 }}
                  >
                    {t(`markets.verdict.${record.statusVerdict}`)}
                  </Tag>
                </Tooltip>
              )}
            </div>
          );
        },
      },
      {
        title: t("markets.columns.price"),
        dataIndex: "price",
        key: "price",
        // The Binance socket pushes roughly a tick a second, so this column is
        // where a change is most visible: green when the price rose, red when
        // it fell.
        render: (price: string) => (
          <span className="num text-[13px] font-semibold tabular-nums">
            <FlashValue value={Number(price)} className="inline-block">
              {price}
            </FlashValue>
          </span>
        ),
      },
      {
        title: t("markets.columns.trend"),
        dataIndex: "spark",
        key: "spark",
        width: 130,
        render: (spark: number[] | undefined) => (
          <Tooltip title={t("markets.columns.trendHint")}>
            <Sparkline values={spark} width={104} height={26} />
          </Tooltip>
        ),
      },
      {
        title: t("markets.columns.changeUsd"),
        dataIndex: "changeUsd",
        key: "changeUsd",
      },
      {
        title: t("markets.columns.change"),
        dataIndex: "change",
        key: "change",
      },
      {
        // The stamp lives in the header rather than on every row, because a
        // timestamp is a property of the snapshot, not of a coin.
        title: () => (
          <span className="text-fg-3 text-[10px] font-semibold tracking-[0.1em] uppercase">
            {t("common.updated")}
          </span>
        ),
        key: "updatedAt",
        width: 150,
        align: "right",
        render: () => <UpdatedStamp at={updatedAt} label="" />,
      },
    ],
    [t, updatedAt],
  );
}
