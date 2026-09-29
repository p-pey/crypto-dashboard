import type { Candle } from "./statuses.types";

/**
 * Pure technical-analysis maths. Kept free of I/O so it can be unit tested
 * against known series and reused by any signal source.
 */

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  return mean(values.slice(-period));
}

export function ema(values: number[], period: number): number[] {
  if (period <= 0 || values.length < period) return [];
  const k = 2 / (period + 1);
  const seed = mean(values.slice(0, period)) ?? 0;
  const out = [seed];
  for (const value of values.slice(period)) {
    const previous = out[out.length - 1] ?? seed;
    out.push(value * k + previous * (1 - k));
  }
  return out;
}

/**
 * Wilder's RSI. `period` values of change need `period + 1` closes, so the
 * caller needs at least that many candles.
 */
export function rsi(values: number[], period = 14): number | null {
  if (period <= 0 || values.length < period + 1) return null;

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const current = values[i] ?? 0;
    const previous = values[i - 1] ?? 0;
    const change = current - previous;
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  for (let i = period + 1; i < values.length; i++) {
    const current = values[i] ?? 0;
    const previous = values[i - 1] ?? 0;
    const change = current - previous;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function macd(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): { macd: number; signal: number; histogram: number } | null {
  if (values.length < slowPeriod + signalPeriod) return null;

  const fast = ema(values, fastPeriod);
  const slow = ema(values, slowPeriod);
  if (fast.length === 0 || slow.length === 0) return null;

  // Align the two EMA series on their common tail.
  const offset = slow.length - fast.length;
  const macdLine = fast.slice(offset).map((value, i) => value - (slow[i] ?? 0));
  if (macdLine.length < signalPeriod) return null;

  const signalLine = ema(macdLine, signalPeriod);
  const signal = signalLine[signalLine.length - 1];
  const macdValue = macdLine[macdLine.length - 1];
  if (signal === undefined || macdValue === undefined) return null;

  return { macd: macdValue, signal, histogram: macdValue - signal };
}

/** Average True Range as a percentage of the last close. */
export function atrPercent(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];
    if (!current || !previous) continue;
    const trueRange = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    );
    trueRanges.push(trueRange);
  }

  const slice = trueRanges.slice(-period);
  const atr = mean(slice);
  const last = candles[candles.length - 1];
  if (atr === null || !last || last.close === 0) return null;
  return (atr / last.close) * 100;
}

export function percentChange(
  values: number[],
  periodsBack: number,
): number | null {
  if (values.length < 2) return null;
  const last = values[values.length - 1];
  const anchorIndex = values.length - 1 - periodsBack;
  const anchor = values[Math.max(0, anchorIndex)];
  if (last === undefined || anchor === undefined || anchor === 0) return null;
  return ((last - anchor) / anchor) * 100;
}

/** Clamp helper shared by every signal builder. */
export function clamp(value: number, min = -100, max = 100): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

/**
 * Maps a value onto -100..100 by scoring how far it sits from `neutral`,
 * reaching +/-100 at the edges of the range. Used for bounded metrics like RSI.
 */
export function scaleAroundNeutral(
  value: number,
  neutral: number,
  lowEdge: number,
  highEdge: number,
): number {
  if (value >= neutral) {
    const span = highEdge - neutral;
    if (span === 0) return 0;
    return clamp(((value - neutral) / span) * 100, 0, 100);
  }
  const span = neutral - lowEdge;
  if (span === 0) return 0;
  return clamp(((value - neutral) / span) * 100, -100, 0);
}
