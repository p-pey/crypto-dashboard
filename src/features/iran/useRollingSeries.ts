"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** The sparkline shows exactly this much history. */
export const SPARK_WINDOW_MS = 60 * 60_000;

type Sample = { at: number; value: number };

/** Redraws are throttled to this, so a fast poll does not thrash the table. */
const REDRAW_MS = 10_000;

/**
 * A rolling one-hour price series per row.
 *
 * The table is a snapshot, not a stream: each poll hands back one price per
 * instrument, so a sparkline has to be accumulated from those snapshots to
 * show anything at all. History lives in a `useRef` so re-renders do not reset
 * it, and the rendered series is only recomputed every {@link REDRAW_MS} so
 * 300+ rows stay off the React render path between refreshes.
 */
export function useRollingSeries(points: ReadonlyMap<string, number>): {
  series: ReadonlyMap<string, number[]>;
  reset: () => void;
} {
  const history = useRef(new Map<string, Sample[]>());
  const [series, setSeries] = useState<ReadonlyMap<string, number[]>>(
    new Map(),
  );
  const lastRedraw = useRef(0);

  useEffect(() => {
    if (points.size === 0) return;
    const now = Date.now();

    for (const [key, value] of points) {
      if (!Number.isFinite(value) || value <= 0) continue;
      const samples = history.current.get(key) ?? [];
      const last = samples[samples.length - 1];

      // A repeated price is not a new observation, and storing duplicates would
      // flatten the line for a quiet market.
      if (last?.value === value) continue;

      samples.push({ at: now, value });
      if (samples.length > 4_000) samples.splice(0, samples.length - 4_000);
      history.current.set(key, samples);
    }

    if (now - lastRedraw.current < REDRAW_MS) return;
    lastRedraw.current = now;
    setSeries(build(history.current));
  }, [points]);

  const reset = useCallback(() => {
    history.current.clear();
    lastRedraw.current = 0;
    setSeries(new Map());
  }, []);

  return { series, reset };
}

function build(history: ReadonlyMap<string, Sample[]>): Map<string, number[]> {
  const cutoff = Date.now() - SPARK_WINDOW_MS;
  const out = new Map<string, number[]>();

  for (const [key, samples] of history) {
    const values: number[] = [];
    for (const sample of samples) {
      if (sample.at >= cutoff) values.push(sample.value);
    }
    // A single point draws a flat line, so it is not worth rendering.
    if (values.length > 1) out.set(key, values);
  }

  return out;
}
