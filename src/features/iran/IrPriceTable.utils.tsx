import { Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import Sparkline from "~/features/shared/Sparkline";
import type { IrTicker, IrTickerStatus } from "~/services/iran/iran.types";

const IR_NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function formatIrt(value: number | null): string {
  if (value === null) return "—";
  return IR_NUMBER_FORMAT.format(value);
}

export function formatSpread(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(3)}%`;
}

const STATUS_LABEL: Record<IrTickerStatus, string> = {
  live: "live",
  connecting: "connecting",
  stale: "stale",
  error: "unavailable",
};

function StatusTag({ ticker }: { ticker: IrTicker }) {
  const title =
    ticker.error ??
    (ticker.updatedAt
      ? `last update ${new Date(ticker.updatedAt).toLocaleTimeString()}`
      : "no update yet");

  const dot: Record<IrTickerStatus, string> = {
    live: "var(--mint)",
    connecting: "var(--cyan)",
    stale: "var(--amber)",
    error: "var(--rose)",
  };

  return (
    <span title={title} className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={`size-1.5 shrink-0 rounded-full ${
          ticker.status === "live" ? "animate-pulse" : ""
        }`}
        style={{ background: dot[ticker.status] }}
      />
      <span
        className="text-[11.5px] font-semibold"
        style={{ color: dot[ticker.status] }}
      >
        {STATUS_LABEL[ticker.status]}
      </span>
    </span>
  );
}

function Price({ value, color }: { value: number | null; color?: string }) {
  return (
    <span
      className="num text-[13px] font-semibold tabular-nums"
      style={{
        color,
        opacity: value === null ? 0.35 : 1,
      }}
    >
      {formatIrt(value)}
    </span>
  );
}

export const irPriceColumns: ColumnsType<IrTicker> = [
  {
    title: "Exchange",
    dataIndex: "exchangeLabel",
    key: "exchangeLabel",
    width: 140,
    render: (_value, ticker) => (
      <a
        href={ticker.exchangeWebsite}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 text-[13px] font-semibold no-underline transition-opacity hover:opacity-80"
        style={{ color: ticker.exchangeColor }}
      >
        <span
          aria-hidden
          className="size-2 rounded-full"
          style={{ background: ticker.exchangeColor }}
        />
        {ticker.exchangeLabel}
      </a>
    ),
  },
  {
    title: "Symbol",
    dataIndex: "symbol",
    key: "symbol",
    width: 150,
    render: (value: string | null) => (
      <span className="mono text-fg-3 text-[12px]">{value ?? "—"}</span>
    ),
  },
  {
    title: "Best bid",
    dataIndex: "bestBid",
    key: "bestBid",
    align: "right",
    width: 150,
    render: (value: number | null) => <Price value={value} color="var(--up)" />,
  },
  {
    title: "Best ask",
    dataIndex: "bestAsk",
    key: "bestAsk",
    align: "right",
    width: 150,
    render: (value: number | null) => (
      <Price value={value} color="var(--down)" />
    ),
  },
  {
    title: "Mid",
    dataIndex: "mid",
    key: "mid",
    align: "right",
    width: 150,
    sorter: (a, b) => (a.mid ?? 0) - (b.mid ?? 0),
    defaultSortOrder: "descend",
    render: (value: number | null) => (
      <Price value={value} color="var(--text)" />
    ),
  },
  {
    title: "Trend",
    dataIndex: "spark",
    key: "spark",
    width: 140,
    render: (spark: number[] | undefined, ticker) => (
      <Tooltip
        title={
          ticker.source === "socket"
            ? "Live mid-price, appended on every socket update"
            : "Mid-price from the REST refresh (socket unavailable)"
        }
      >
        <Sparkline values={spark} width={110} height={26} />
      </Tooltip>
    ),
  },
  {
    title: "Spread",
    dataIndex: "spreadPercent",
    key: "spreadPercent",
    align: "right",
    width: 110,
    render: (value: number | null) => (
      <span className="num text-fg-2 text-[12.5px] tabular-nums">
        {formatSpread(value)}
      </span>
    ),
  },
  {
    title: "Status",
    dataIndex: "status",
    key: "status",
    width: 130,
    render: (_value, ticker) => <StatusTag ticker={ticker} />,
  },
  {
    title: "Updated",
    dataIndex: "updatedAt",
    key: "updatedAt",
    width: 110,
    align: "right",
    render: (value: number | null) => (
      <span className="num text-fg-3 text-[12px] tabular-nums">
        {value ? new Date(value).toLocaleTimeString() : "—"}
      </span>
    ),
  },
];
