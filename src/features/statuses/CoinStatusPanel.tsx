"use client";

import {
  Alert,
  Button,
  Descriptions,
  Empty,
  Progress,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useMemo } from "react";
import { api } from "~/trpc/react";
import type {
  StatusSignal,
  StatusVerdict,
} from "~/services/statuses/statuses.types";

const VERDICT_META: Record<
  StatusVerdict,
  { label: string; color: string; advice: string }
> = {
  strong_buy: {
    label: "Strong Buy",
    color: "#00b894",
    advice:
      "Signals line up favourably. Still size the position as if it could be wrong.",
  },
  buy: { label: "Buy", color: "#7bed9f", advice: "Mildly favourable setup." },
  neutral: {
    label: "Hold",
    color: "#dfe6e9",
    advice: "Nothing decisive either way. Waiting costs nothing here.",
  },
  reduce: {
    label: "Reduce",
    color: "#fdcb6e",
    advice: "Some signals have turned. Trimming risk is reasonable.",
  },
  avoid: {
    label: "Avoid",
    color: "#ff7675",
    advice: "Signals are unfavourable. Standing aside is the position.",
  },
};

function signalColor(signal: StatusSignal): string {
  if (!signal.available) return "#dfe6e9";
  if (signal.score >= 40) return "#00b894";
  if (signal.score >= 15) return "#7bed9f";
  if (signal.score <= -40) return "#d63031";
  if (signal.score <= -15) return "#ff7675";
  return "#dfe6e9";
}

function SignalBar({ signal }: { signal: StatusSignal }) {
  if (!signal.available) {
    return (
      <Tooltip title={signal.detail}>
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
        >
          <span style={{ opacity: 0.5 }}>{signal.label}</span>
          <span style={{ opacity: 0.4, fontSize: 12 }}>unavailable</span>
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={`${signal.detail} (weight ${signal.weight})`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>{signal.label}</span>
        <span
          style={{
            color: signalColor(signal),
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {signal.score > 0 ? "+" : ""}
          {Math.round(signal.score)}
        </span>
      </div>
    </Tooltip>
  );
}

export type CoinStatusPanelProps = {
  coinId: string | undefined;
  symbol: string;
  name: string | undefined;
  onForceRefresh?: () => void;
};

/**
 * Rendered inside the expanded row of the coin table. Analysis runs on demand
 * the first time a row is opened, then comes from the 24h server cache.
 */
export default function CoinStatusPanel({
  coinId,
  symbol,
  name,
  onForceRefresh,
}: CoinStatusPanelProps) {
  return coinId ? (
    <PanelBody
      coinId={coinId}
      symbol={symbol}
      name={name}
      onForceRefresh={onForceRefresh}
    />
  ) : (
    <Alert
      type="warning"
      showIcon
      message="No CoinGecko id for this row"
      description="Status analysis needs the CoinGecko id and cannot run for this coin."
    />
  );
}

function PanelBody({
  coinId,
  symbol,
  name,
  onForceRefresh,
}: {
  coinId: string;
  symbol: string;
  name: string | undefined;
  onForceRefresh?: () => void;
}) {
  const input = { coinId, symbol, name: name ?? undefined };

  const { data, isLoading, isFetching, error } =
    api.statuses.getStatus.useQuery(input, {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    });

  const utils = api.useUtils();

  // `getStatus` cannot force a refresh through refetch(), so re-analysis goes
  // through the batch mutation and then invalidates the cached query.
  const refresh = api.statuses.refreshBatch.useMutation({
    onSuccess: async () => {
      await utils.statuses.getStatus.invalidate(input);
      await utils.statuses.listCached.invalidate();
      onForceRefresh?.();
    },
  });

  const status = data?.status ?? null;
  const meta = status ? VERDICT_META[status.verdict] : null;

  const sortedSignals = useMemo(() => {
    if (!status) return [];
    return [...status.signals].sort(
      (a, b) =>
        Number(b.available) - Number(a.available) || b.weight - a.weight,
    );
  }, [status]);

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message="Analysis failed"
        description={
          error instanceof Error ? error.message : "unexpected error"
        }
      />
    );
  }

  if (isLoading && !status) {
    return (
      <div style={{ padding: 8 }}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </div>
    );
  }

  if (!status) {
    return <Empty description="No status available" />;
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Space size="small" align="center" wrap>
          <Tag color={meta?.color} style={{ fontWeight: 700, fontSize: 13 }}>
            {meta?.label}
          </Tag>
          <Typography.Text type="secondary">
            composite score {status.score} / 100
          </Typography.Text>
          <Tooltip title={meta?.advice}>
            <Typography.Text type="secondary" style={{ cursor: "help" }}>
              {meta?.advice}
            </Typography.Text>
          </Tooltip>
        </Space>

        <Space size="small">
          {isFetching && (
            <Typography.Text type="secondary">updating…</Typography.Text>
          )}
          <Button
            size="small"
            loading={refresh.isPending}
            onClick={() =>
              refresh.mutate({
                coins: [{ coinId, symbol, name: name ?? undefined }],
                refreshExisting: true,
              })
            }
          >
            Re-analyse
          </Button>
        </Space>
      </div>

      <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
        {status.summary}
      </Typography.Paragraph>

      <Progress
        percent={50 + status.score / 2}
        format={() => `${status.score}`}
        strokeColor={
          status.score >= 15
            ? "#00b894"
            : status.score <= -15
              ? "#d63031"
              : "#b2bec3"
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <div
          style={{
            border: "1px solid #dfe6e9",
            borderRadius: 8,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <Typography.Text strong>Signals</Typography.Text>
          {sortedSignals.map((signal) => (
            <SignalBar key={signal.key} signal={signal} />
          ))}
        </div>

        <div
          style={{
            border: "1px solid #dfe6e9",
            borderRadius: 8,
            padding: 12,
          }}
        >
          <Typography.Text strong>Technicals</Typography.Text>
          <Descriptions
            size="small"
            column={1}
            style={{ marginTop: 8 }}
            items={[
              {
                key: "rsi",
                label: "RSI14",
                children: fmt(status.technicals?.rsi14),
              },
              {
                key: "sma20",
                label: "SMA20",
                children: fmt(status.technicals?.sma20),
              },
              {
                key: "sma50",
                label: "SMA50",
                children: fmt(status.technicals?.sma50),
              },
              {
                key: "sma200",
                label: "SMA200",
                children: fmt(status.technicals?.sma200),
              },
              {
                key: "macd",
                label: "MACD hist",
                children: fmt(status.technicals?.macdHistogram, 6),
              },
              {
                key: "atr",
                label: "ATR",
                children: pct(status.technicals?.atrPct),
              },
              {
                key: "d7",
                label: "7d change",
                children: pct(status.technicals?.change7d),
              },
            ]}
          />
        </div>

        <div
          style={{
            border: "1px solid #dfe6e9",
            borderRadius: 8,
            padding: 12,
          }}
        >
          <Typography.Text strong>Market &amp; community</Typography.Text>
          <Descriptions
            size="small"
            column={1}
            style={{ marginTop: 8 }}
            items={[
              {
                key: "rank",
                label: "MCap rank",
                children: fmt(status.market?.marketCapRank),
              },
              {
                key: "votes",
                label: "Bullish votes",
                children: pct(status.market?.votesUpPercent),
              },
              {
                key: "watch",
                label: "Watchlist users",
                children: fmt(status.market?.watchlistUsers),
              },
              {
                key: "ath",
                label: "From ATH",
                children: pct(status.market?.athChangePercent),
              },
              {
                key: "fng",
                label: "Fear & greed",
                children:
                  status.market?.fearAndGreed === null ||
                  status.market?.fearAndGreed === undefined
                    ? "—"
                    : `${status.market.fearAndGreed} (${status.market.fearAndGreedLabel ?? ""})`,
              },
            ]}
          />
        </div>
      </div>

      {status.news.length > 0 && (
        <div>
          <Typography.Text strong>Recent headlines</Typography.Text>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {status.news.slice(0, 5).map((item) => (
              <li key={item.link} style={{ marginBottom: 4 }}>
                <a href={item.link} target="_blank" rel="noreferrer">
                  {item.title}
                </a>{" "}
                <Tag
                  color={
                    item.sentiment > 0.1
                      ? "green"
                      : item.sentiment < -0.1
                        ? "red"
                        : "default"
                  }
                >
                  {item.sentiment > 0 ? "+" : ""}
                  {item.sentiment.toFixed(2)}
                </Tag>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Space size="small" wrap>
        <Tag>
          written by{" "}
          {status.generatedBy === "llm"
            ? `${status.llmProvider} / ${status.llmModel}`
            : "deterministic scorer"}
        </Tag>
        <Tag>cached until {new Date(status.expiresAt).toLocaleString()}</Tag>
      </Space>

      {status.llmError && (
        <Alert
          type="info"
          showIcon
          message="LLM unavailable, deterministic narrative used"
          description={status.llmError}
        />
      )}

      {status.unavailableSources.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="Some data sources were unreachable"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {status.unavailableSources.map((source) => (
                <li key={source}>{source}</li>
              ))}
            </ul>
          }
        />
      )}
    </Space>
  );
}

function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(2)}%`;
}
