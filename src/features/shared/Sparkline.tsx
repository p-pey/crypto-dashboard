"use client";

import { memo } from "react";
import { Sparklines, SparklinesLine } from "react-sparklines";

export type SparklineProps = {
  values: number[] | null | undefined;
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
};

const UP = "var(--mint)";
const DOWN = "var(--rose)";
const FLAT = "var(--cyan)";

/**
 * Compact trend line for table cells.
 *
 * Wraps `react-sparklines` (already a dependency, and already used by the ETF
 * cards) so both tables share one look. Colours itself from the direction of
 * the series and degrades to a placeholder until there is enough data to draw.
 */
function SparklineImpl({
  values,
  width = 96,
  height = 26,
  stroke,
  strokeWidth = 1.5,
}: SparklineProps) {
  const series = (values ?? []).filter(
    (value) => typeof value === "number" && Number.isFinite(value),
  );

  if (series.length < 2) {
    return (
      <span
        style={{
          display: "inline-block",
          width,
          height,
          verticalAlign: "middle",
          fontSize: 11,
          color: "#b2bec3",
          lineHeight: `${height}px`,
          textAlign: "center",
        }}
      >
        {series.length === 1 ? "…" : "collecting"}
      </span>
    );
  }

  const first = series[0] ?? 0;
  const last = series[series.length - 1] ?? 0;
  const color = stroke ?? (last > first ? UP : last < first ? DOWN : FLAT);

  return (
    <Sparklines
      data={series}
      width={width}
      height={height}
      margin={1.5}
      style={{ width, height, display: "block" }}
    >
      <SparklinesLine
        style={{
          strokeWidth,
          stroke: color,
          fill: "none",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
      />
    </Sparklines>
  );
}

export default memo(SparklineImpl);
