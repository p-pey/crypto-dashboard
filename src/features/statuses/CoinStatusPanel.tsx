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
import { VERDICT_COLOR } from "~/features/coins/coinVerdict";
import { formatDateTime, formatNumber, formatPercent } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type { Locale } from "~/i18n/config";
import { api } from "~/trpc/react";
import type { StatusSignal } from "~/services/statuses/statuses.types";

function signalColor(signal: StatusSignal): string {
  if (!signal.available) return "#95a5a6";
  if (signal.score >= 40) return "#00b894";
  if (signal.score >= 15) return "#7bed9f";
  if (signal.score <= -40) return "#d63031";
  if (signal.score <= -15) return "#ff7675";
  return "#95a5a6";
}

function SignalBar({ signal }: { signal: StatusSignal }) {
  const { t } = useI18n();

  if (!signal.available) {
    return (
      <Tooltip title={signal.detail}>
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
        >
          <span style={{ opacity: 0.5 }}>{signal.label}</span>
          <span style={{ opacity: 0.4, fontSize: 12 }}>
            {t("markets.panel.unavailableLabel")}
          </span>
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip
      title={`${signal.detail} (${t("markets.panel.weightSuffix", signal.weight)})`}
    >
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
  const { t } = useI18n();

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
      message={t("markets.panel.noCoinIdTitle")}
      description={t("markets.panel.noCoinIdBody")}
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
  const { locale, t } = useI18n();
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

  const sortedSignals = useMemo(() => {
    if (!status) return [];
    return [...status.signals].sort(
      (a, b) =>
        Number(b.available) - Number(a.available) || b.weight - a.weight,
    );
  }, [status]);

  const cardStyle: React.CSSProperties = {
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 12,
  };

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message={t("markets.panel.failedTitle")}
        description={
          error instanceof Error
            ? error.message
            : t("markets.panel.unexpectedError")
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
    return <Empty description={t("markets.panel.empty")} />;
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
          <Tag
            color={VERDICT_COLOR[status.verdict]}
            style={{ fontWeight: 700, fontSize: 13 }}
          >
            {t(`markets.verdict.${status.verdict}`)}
          </Tag>
          <Typography.Text type="secondary">
            {t("markets.panel.composite", status.score)}
          </Typography.Text>
          <Tooltip title={t(`markets.verdictAdvice.${status.verdict}`)}>
            <Typography.Text
              type="secondary"
              style={{ cursor: "help", maxWidth: 460 }}
            >
              {t(`markets.verdictAdvice.${status.verdict}`)}
            </Typography.Text>
          </Tooltip>
        </Space>

        <Space size="small">
          {isFetching && (
            <Typography.Text type="secondary">
              {t("markets.panel.updating")}
            </Typography.Text>
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
            {t("markets.panel.reanalyse")}
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
              : "#95a5a6"
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
            ...cardStyle,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <Typography.Text strong>{t("markets.panel.signals")}</Typography.Text>
          {sortedSignals.map((signal) => (
            <SignalBar key={signal.key} signal={signal} />
          ))}
        </div>

        <div style={cardStyle}>
          <Typography.Text strong>
            {t("markets.panel.technicals")}
          </Typography.Text>
          <Descriptions
            size="small"
            column={1}
            style={{ marginTop: 8 }}
            items={[
              {
                key: "rsi",
                label: t("markets.panel.labels.rsi"),
                children: fmt(locale, status.technicals?.rsi14),
              },
              {
                key: "sma20",
                label: t("markets.panel.labels.sma20"),
                children: fmt(locale, status.technicals?.sma20),
              },
              {
                key: "sma50",
                label: t("markets.panel.labels.sma50"),
                children: fmt(locale, status.technicals?.sma50),
              },
              {
                key: "sma200",
                label: t("markets.panel.labels.sma200"),
                children: fmt(locale, status.technicals?.sma200),
              },
              {
                key: "macd",
                label: t("markets.panel.labels.macd"),
                children: fmt(locale, status.technicals?.macdHistogram, 6),
              },
              {
                key: "atr",
                label: t("markets.panel.labels.atr"),
                children: pct(locale, status.technicals?.atrPct),
              },
              {
                key: "d7",
                label: t("markets.panel.labels.change7d"),
                children: pct(locale, status.technicals?.change7d),
              },
            ]}
          />
        </div>

        <div style={cardStyle}>
          <Typography.Text strong>{t("markets.panel.market")}</Typography.Text>
          <Descriptions
            size="small"
            column={1}
            style={{ marginTop: 8 }}
            items={[
              {
                key: "rank",
                label: t("markets.panel.labels.marketCapRank"),
                children: fmt(locale, status.market?.marketCapRank, 0),
              },
              {
                key: "votes",
                label: t("markets.panel.labels.votesUp"),
                children: pct(locale, status.market?.votesUpPercent),
              },
              {
                key: "watch",
                label: t("markets.panel.labels.watchlist"),
                children: fmt(locale, status.market?.watchlistUsers, 0),
              },
              {
                key: "ath",
                label: t("markets.panel.labels.fromAth"),
                children: pct(locale, status.market?.athChangePercent),
              },
              {
                key: "fng",
                label: t("markets.panel.labels.fearGreed"),
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
          <Typography.Text strong>
            {t("markets.panel.headlines")}
          </Typography.Text>
          <ul style={{ margin: "8px 0 0", paddingInlineStart: 18 }}>
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
          {t(
            "markets.panel.writtenBy",
            status.generatedBy === "llm"
              ? `${status.llmProvider} / ${status.llmModel}`
              : t("markets.panel.deterministic"),
          )}
        </Tag>
        <Tag>
          {t(
            "markets.panel.cachedUntil",
            formatDateTime(locale, status.expiresAt),
          )}
        </Tag>
      </Space>

      {status.llmError && (
        <Alert
          type="info"
          showIcon
          message={t("markets.panel.llmUnavailableTitle")}
          description={status.llmError}
        />
      )}

      {status.unavailableSources.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={t("markets.panel.sourcesDownTitle")}
          description={
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
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

function fmt(
  locale: Locale,
  value: number | null | undefined,
  digits = 2,
): string {
  return formatNumber(locale, value, { maximumFractionDigits: digits });
}

function pct(locale: Locale, value: number | null | undefined): string {
  return formatPercent(locale, value, 2);
}
