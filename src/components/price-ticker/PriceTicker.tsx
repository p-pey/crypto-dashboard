"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { navHref } from "~/constants/navigation";
import { formatSignedPercent } from "~/i18n/format";
import { useI18n } from "~/i18n/I18nProvider";
import { api } from "~/trpc/react";
import type { CoinFundamentalDto } from "~/server/api/overview/overview.mapper";

/**
 * Pixels the strip travels per second.
 *
 * The animation distance is a percentage of the content, so a fixed duration
 * would make the strip visibly faster or slower depending on how many coins
 * are listed. Measuring the content and deriving the duration from a constant
 * speed keeps the crawl steady, and slow, at any list length.
 */
const SPEED_PX_PER_SECOND = 22;

/** Upper bound on rendered copies, so a huge list cannot bloat the DOM. */
const MAX_COPIES = 6;

export default function PriceTicker() {
  const { locale, t } = useI18n();
  const { data } = api.overview.getPrices.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: 60_000,
  });

  const items: CoinFundamentalDto[] = data ?? [];
  const home = navHref(locale, "/");

  const trackRef = useRef<HTMLDivElement>(null);
  const [durationMs, setDurationMs] = useState(120_000);

  /**
   * How many copies are needed to cover the viewport twice over, so the loop
   * point is never visible.
   */
  const copies = useMemoCopies(trackRef, items.length);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || items.length === 0) return;

    const measure = () => {
      // One copy's width, not the whole track: the loop is translate(-50%) of
      // a two-copy track, so it advances by exactly one copy width.
      const oneCopy = track.firstElementChild;
      if (!oneCopy) return;
      const width = oneCopy.getBoundingClientRect().width;
      if (width <= 0) return;
      setDurationMs(Math.max(20_000, (width / SPEED_PX_PER_SECOND) * 1000));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [items.length, copies]);

  return (
    <div className="glass relative flex h-[42px] items-center overflow-hidden rounded-[16px]">
      <div className="border-line/70 from-brand/20 z-10 flex h-full shrink-0 items-center gap-2 border-e bg-gradient-to-r to-transparent px-3.5">
        <span className="bg-brand-2 size-1.5 animate-pulse rounded-full shadow-[0_0_10px_var(--brand-2)]" />
        <span className="text-fg-2 text-[10px] font-bold tracking-[0.14em] uppercase">
          {t("footer.change24h")}
        </span>
      </div>

      <div className="group relative min-w-0 flex-1 overflow-hidden">
        {items.length === 0 ? (
          <div className="flex h-full items-center gap-3 px-4">
            {Array.from({ length: 9 }, (_, i) => (
              <div
                key={i}
                className="bg-surface-3 h-2.5 w-16 animate-pulse rounded-full"
              />
            ))}
          </div>
        ) : (
          <div
            ref={trackRef}
            className="animate-ticker flex w-max group-hover:[animation-play-state:paused]"
            style={{ animationDuration: `${durationMs}ms` }}
          >
            {Array.from({ length: copies }, (_, dup) => (
              <div
                key={dup}
                className="flex shrink-0 items-center"
                aria-hidden={dup > 0}
              >
                {items.map((coin) => {
                  const up = (coin.changePercent24h ?? 0) >= 0;
                  return (
                    <Link
                      key={`${dup}-${coin.id}`}
                      href={home}
                      className="num hover:bg-surface-2 flex items-center gap-1.5 px-3.5 py-1 text-[12px] whitespace-nowrap transition-colors"
                    >
                      <span className="text-fg-2 font-semibold">
                        {coin.name.slice(0, 3).toUpperCase()}
                      </span>
                      <span
                        className="font-bold tabular-nums"
                        style={{ color: up ? "var(--up)" : "var(--down)" }}
                      >
                        {formatSignedPercent(
                          locale,
                          coin.changePercent24h ?? 0,
                        )}
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={up ? "var(--up)" : "var(--down)"}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`size-3 ${up ? "" : "rotate-180"}`}
                      >
                        <path d="M7 14l5-5 5 5" />
                      </svg>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div className="from-surface pointer-events-none absolute inset-y-0 start-0 w-10 bg-gradient-to-r to-transparent" />
        <div className="from-surface pointer-events-none absolute inset-y-0 end-0 w-10 bg-gradient-to-l to-transparent" />
      </div>
    </div>
  );
}

/**
 * Copies needed to exceed the container width. Measured after layout, and kept
 * at two until then, which is the minimum for a seamless loop.
 */
function useMemoCopies(
  trackRef: React.RefObject<HTMLDivElement | null>,
  itemCount: number,
): number {
  const [copies, setCopies] = useState(2);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || itemCount === 0) return;

    const measure = () => {
      const oneCopy = track.firstElementChild;
      if (!oneCopy) return;
      const copyWidth = oneCopy.getBoundingClientRect().width;
      const visible = track.parentElement?.getBoundingClientRect().width ?? 0;
      if (copyWidth <= 0 || visible <= 0) return;
      // Two full viewports of content means the seam is always off screen.
      setCopies(
        Math.min(MAX_COPIES, Math.ceil((visible * 2) / copyWidth) || 2),
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [itemCount, trackRef]);

  return copies;
}
