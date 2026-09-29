"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatNumber } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import type { Candle, CandleInterval } from "~/services/candles/candle.types";

/**
 * Candlestick renderer.
 *
 * Hand drawn on a canvas rather than pulled from a charting library: the app
 * has no charting dependency, and a candle this simple is cheaper to rasterise
 * than to reconcile through React. The canvas is sized to the device pixel
 * ratio and redrawn on resize, so it stays sharp on HiDPI displays.
 *
 * It draws candles, a volume histogram, a 20-period moving average, and a
 * crosshair with an OHLC readout. That is the subset of a trading terminal
 * that is worth the bytes; order books, drawing tools and multi-timeframe
 * state are not reimplemented here.
 */

const UP = "#059669";
const DOWN = "#e11d48";
const MA_COLOR = "#d97706";
const GRID = "rgba(120, 130, 160, 0.16)";
const AXIS = "var(--text-3)";

const PAD = { top: 12, right: 68, bottom: 26, left: 8 };
/** Fraction of the plot height given over to the volume histogram. */
const VOLUME_SHARE = 0.2;
const MA_PERIOD = 20;

export type CandleChartProps = {
  candles: Candle[];
  interval: CandleInterval;
  height?: number;
  unitLabel: string;
};

export default function CandleChart({
  candles,
  interval,
  height = 420,
  unitLabel,
}: CandleChartProps) {
  const { locale } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(0);

  // Track the wrapper so the canvas follows layout changes.
  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    setWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => {
    const plotW = Math.max(0, width - PAD.left - PAD.right);
    const plotH = Math.max(0, height - PAD.top - PAD.bottom);
    const priceH = plotH * (1 - VOLUME_SHARE);
    const volumeH = plotH * VOLUME_SHARE;

    if (candles.length === 0 || plotW <= 0 || plotH <= 0) {
      return { plotW, plotH, priceH, volumeH, min: 0, max: 0, maxVolume: 0 };
    }

    let min = Infinity;
    let max = -Infinity;
    let maxVolume = 0;
    for (const c of candles) {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
      if (c.volume !== null && c.volume > maxVolume) maxVolume = c.volume;
    }
    // A flat series would divide by zero; give it a nominal band.
    if (max === min) {
      min -= Math.abs(min || 1) * 0.001;
      max += Math.abs(max || 1) * 0.001;
    }
    // 4% headroom so wicks are not clipped by the frame.
    const pad = (max - min) * 0.04;
    return {
      plotW,
      plotH,
      priceH,
      volumeH,
      min: min - pad,
      max: max + pad,
      maxVolume,
    };
  }, [candles, height, width]);

  const movingAverage = useMemo(
    () => simpleMovingAverage(candles, MA_PERIOD),
    [candles],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, {
      candles,
      movingAverage,
      layout,
      width,
      height,
      hover,
      locale,
      interval,
    });
  }, [candles, height, hover, interval, layout, locale, movingAverage, width]);

  const hovered = hover !== null ? candles[hover] : null;
  const last = candles[candles.length - 1];

  function onMove(event: React.MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - PAD.left;
    if (candles.length === 0 || layout.plotW <= 0) return;
    const step = layout.plotW / candles.length;
    const index = Math.floor(x / step);
    setHover(index >= 0 && index < candles.length ? index : null);
  }

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <div className="text-fg-3 pointer-events-none absolute start-0 top-0 z-10 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold tabular-nums">
        {candles.length === 0 ? null : (
          <>
            <span>
              O&nbsp;{formatNumber(locale, (hovered ?? last)?.open ?? null)}
            </span>
            <span>
              H&nbsp;{formatNumber(locale, (hovered ?? last)?.high ?? null)}
            </span>
            <span>
              L&nbsp;{formatNumber(locale, (hovered ?? last)?.low ?? null)}
            </span>
            <span
              style={{
                color:
                  (hovered ?? last)!.close >= (hovered ?? last)!.open
                    ? UP
                    : DOWN,
              }}
            >
              C&nbsp;{formatNumber(locale, (hovered ?? last)?.close ?? null)}
            </span>
            <span className="text-fg-3">{unitLabel}</span>
          </>
        )}
      </div>

      <canvas
        ref={canvasRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="block"
        role="img"
        aria-label={`candlestick chart ${interval}`}
      />
    </div>
  );
}

function simpleMovingAverage(
  candles: Candle[],
  period: number,
): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    if (!candle) {
      out.push(null);
      continue;
    }
    sum += candle.close;
    if (i >= period) {
      const dropped = candles[i - period];
      if (dropped) sum -= dropped.close;
    }
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

type DrawArgs = {
  candles: Candle[];
  movingAverage: (number | null)[];
  layout: {
    plotW: number;
    plotH: number;
    priceH: number;
    volumeH: number;
    min: number;
    max: number;
    maxVolume: number;
  };
  width: number;
  height: number;
  hover: number | null;
  locale: "fa" | "en" | "de";
  interval: CandleInterval;
};

function draw(ctx: CanvasRenderingContext2D, args: DrawArgs) {
  const { candles, layout, width, height, hover } = args;
  const { plotW, priceH, volumeH, min, max } = layout;

  ctx.clearRect(0, 0, width, height);
  if (candles.length === 0 || plotW <= 0) return;

  const top = PAD.top;
  const priceRange = max - min || 1;
  const toY = (price: number) =>
    top + (1 - (price - min) / priceRange) * priceH;
  const toVolumeY = (volume: number) =>
    top + priceH + volumeH - (volume / (layout.maxVolume || 1)) * volumeH;

  const step = plotW / candles.length;
  const bodyW = Math.max(1, Math.min(14, step * 0.62));

  // Horizontal grid + price axis labels.
  ctx.lineWidth = 1;
  ctx.font = "10px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i += 1) {
    const y = Math.round(top + (priceH / gridLines) * i) + 0.5;
    ctx.strokeStyle = GRID;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + plotW, y);
    ctx.stroke();

    const price = max - (priceRange / gridLines) * i;
    ctx.fillStyle = AXIS;
    ctx.textAlign = "left";
    ctx.fillText(compact(price), PAD.left + plotW + 6, y);
  }

  // Candles, then volume.
  candles.forEach((candle, i) => {
    const x = PAD.left + step * i + step / 2;
    const rising = candle.close >= candle.open;
    const color = rising ? UP : DOWN;

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;

    const wickX = Math.round(x) + 0.5;
    ctx.beginPath();
    ctx.moveTo(wickX, toY(candle.high));
    ctx.lineTo(wickX, toY(candle.low));
    ctx.stroke();

    const openY = toY(candle.open);
    const closeY = toY(candle.close);
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(1, Math.abs(closeY - openY));

    if (rising) {
      // Hollow up candles read better on a light background.
      ctx.fillStyle = "transparent";
      ctx.strokeRect(
        Math.round(x - bodyW / 2) + 0.5,
        Math.round(bodyTop) + 0.5,
        Math.round(bodyW),
        Math.round(bodyHeight),
      );
    } else {
      ctx.fillRect(
        Math.round(x - bodyW / 2),
        Math.round(bodyTop),
        Math.round(bodyW),
        Math.round(bodyHeight),
      );
    }

    if (candle.volume !== null) {
      const vy = toVolumeY(candle.volume);
      ctx.fillStyle = rising ? "rgba(5,150,105,0.35)" : "rgba(225,29,72,0.35)";
      ctx.fillRect(
        Math.round(x - bodyW / 2),
        Math.round(vy),
        Math.round(bodyW),
        Math.round(top + priceH + volumeH - vy),
      );
    }
  });

  // Moving average over the candles.
  ctx.strokeStyle = MA_COLOR;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let started = false;
  candles.forEach((_, i) => {
    const value = args.movingAverage[i];
    if (value === null || value === undefined) return;
    const x = PAD.left + step * i + step / 2;
    const y = toY(value);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  // Time axis.
  ctx.fillStyle = AXIS;
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "center";
  const labelEvery = Math.max(1, Math.floor(candles.length / 6));
  candles.forEach((candle, i) => {
    if (i % labelEvery !== 0) return;
    ctx.fillText(
      timeLabel(candle.time, args.interval),
      PAD.left + step * i + step / 2,
      height - PAD.bottom / 2,
    );
  });

  // Crosshair.
  if (hover !== null && hover >= 0 && hover < candles.length) {
    const x = Math.round(PAD.left + step * hover + step / 2) + 0.5;
    ctx.strokeStyle = "rgba(120,130,160,0.55)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + priceH + volumeH);
    ctx.stroke();
    ctx.setLineDash([]);

    const candle = candles[hover];
    if (candle) {
      const y = Math.round(toY(candle.close)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + plotW, y);
      ctx.stroke();

      const label = compact(candle.close);
      ctx.fillStyle = "rgba(20,22,32,0.92)";
      ctx.fillRect(PAD.left + plotW + 2, y - 8, PAD.right - 6, 16);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.fillText(label, PAD.left + plotW + 6, y);
    }
  }
}

function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  if (abs >= 1) return value.toFixed(2);
  return value.toPrecision(4);
}

function timeLabel(time: number, interval: CandleInterval): string {
  const date = new Date(time);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (interval === "1d") return `${date.getDate()}/${date.getMonth() + 1}`;
  if (interval === "4h" || interval === "1h") return `${hh}:${mm}`;
  return `${hh}:${mm}`;
}
