"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Renders only the rows that are on screen.
 *
 * ## Why this rather than an antd `Table` with `pagination={false}`
 *
 * A hundred rows means a hundred avatar images, a hundred SVG sparklines and
 * several hundred text nodes, and the browser re-styles all of it on every tick.
 * The visible portion is closer to twenty rows, so windowing removes about 80% of
 * the DOM for the price of a scroll handler. The repo already uses this approach
 * for the Iranian board, so the two tables now behave the same way.
 *
 * ## The two things windowing gets wrong if you are careless
 *
 * - **Scroll anchoring.** When the rows above the viewport change height, the
 *   content jumps. Fixed row heights avoid the problem entirely, which is why
 *   the height is a constant rather than measured.
 * - **Overscan.** Scrolling fast can outrun the render, so a buffer of rows is
 *   kept above and below the viewport. Without it the list shows blanks.
 */

/** Row height in pixels. Fixed so the scroll offset can be derived arithmetically. */
export const ROW_HEIGHT = 52;

/** Rows kept rendered beyond the viewport in each direction. */
const OVERSCAN = 6;

/** Extra room taken by the sticky header, so the first row is not clipped. */
const HEADER_HEIGHT = 44;

export type Window = {
  /** Index of the first rendered row. */
  start: number;
  /** Index after the last rendered row. */
  end: number;
  /** Pixels of blank space above the rendered rows, to hold the scroll position. */
  padTop: number;
  /** Pixels of blank space below them. */
  padBottom: number;
  /** True until the container has been measured. Renders a first page eagerly. */
  unmeasured: boolean;
};

export function useWindowedRows(count: number): {
  windowRef: React.RefObject<HTMLDivElement | null>;
  window: Window;
  onScroll: () => void;
} {
  const windowRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = windowRef.current;
    if (!element) return;

    const measure = () => setHeight(element.clientHeight - HEADER_HEIGHT);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const element = windowRef.current;
    if (element) setScrollTop(element.scrollTop);
  }, []);

  const window = useMemo<Window>(() => {
    // Before measurement, show a generous first page. Guessing one screenful
    // would mean a visible pop-in on every mount.
    if (height <= 0) {
      const initial = Math.min(count, 40);
      return {
        start: 0,
        end: initial,
        padTop: 0,
        padBottom: Math.max(0, (count - initial) * ROW_HEIGHT),
        unmeasured: true,
      };
    }

    const visible = Math.ceil(height / ROW_HEIGHT);
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(count, start + visible + OVERSCAN * 2);

    return {
      start,
      end,
      padTop: start * ROW_HEIGHT,
      padBottom: Math.max(0, (count - end) * ROW_HEIGHT),
      unmeasured: false,
    };
  }, [count, height, scrollTop]);

  return { windowRef, window, onScroll };
}
