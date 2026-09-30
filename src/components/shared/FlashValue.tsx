"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** How long the flash lasts before the cell settles back. */
const FLASH_MS = 1_100;

/**
 * A value that flashes on change: green when it rose, red when it fell.
 *
 * The comparison happens in an effect and the class is toggled through the DOM
 * directly, so a cell that flashes does not re-render. That matters here: the
 * markets table receives a Binance tick roughly every second for a hundred
 * rows, and driving that through React state would re-render every cell on
 * every tick for an effect the user only perceives in one line of pixels.
 */
export default function FlashValue({
  value,
  children,
  className = "",
  disabled = false,
}: {
  /** The comparable value, normally the numeric price. */
  value: number | null;
  children: ReactNode;
  className?: string;
  /** Turns the effect off where a flash would be noise, e.g. a sorted column. */
  disabled?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (disabled || value === null) return;

    const before = previous.current;
    previous.current = value;

    // The first sample establishes the baseline; there is nothing to compare.
    if (before === null || before === value) return;

    const element = ref.current;
    if (!element) return;

    element.classList.remove("flash-up", "flash-down");
    // Forcing a reflow makes removing and re-adding the class restart the CSS
    // animation instead of being coalesced away.
    void element.offsetWidth;
    element.classList.add(value > before ? "flash-up" : "flash-down");

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      element.classList.remove("flash-up", "flash-down");
    }, FLASH_MS);
  }, [value, disabled]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  );
}
