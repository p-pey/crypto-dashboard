import { marketSource, type MarketSourceId } from "~/constants/iranMarket";
import type { ExchangeId } from "~/services/trading/trading.types";

/**
 * Venue name and colour for the trading screens.
 *
 * The four Iranian venues already have identities in the price board's
 * catalogue, so those are reused rather than duplicated. BitUnix is not on that
 * board, so it carries its own entry here - which is also what happens
 * automatically for any venue added before it reaches the price board.
 *
 * These are presentation concerns only. Nothing in the trading path depends on
 * a venue having a colour.
 */

const EXTRA_VENUES: Partial<
  Record<ExchangeId, { label: string; color: string }>
> = {
  bitunix: { label: "BitUnix", color: "#f0b90b" },
};

function isBoardVenue(id: string): id is MarketSourceId {
  return (
    id === "nerkh" ||
    (["nobitex", "wallex", "bitpin", "tabdeal"] as string[]).includes(id)
  );
}

export function venueLabel(id: string): string {
  const extra = EXTRA_VENUES[id as ExchangeId];
  if (extra) return extra.label;
  return isBoardVenue(id) ? marketSource(id).label : id;
}

export function venueColor(id: string): string {
  const extra = EXTRA_VENUES[id as ExchangeId];
  if (extra) return extra.color;
  return isBoardVenue(id) ? marketSource(id).color : "var(--text-3)";
}
