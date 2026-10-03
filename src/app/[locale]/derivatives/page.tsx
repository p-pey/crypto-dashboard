"use client";

import DerivativesPanel from "~/features/derivatives/DerivativesPanel";
import LiquidationsPanel from "~/features/derivatives/LiquidationsPanel";
import PerpMatrixPanel from "~/features/derivatives/PerpMatrixPanel";

/**
 * The derivatives desk, in the order a trader works it.
 *
 * Liquidations first because they are the reason the page exists and the only
 * figure here that is genuinely time-sensitive — a cascade is over in minutes.
 * The cross-venue board second because it is positioning: who is paying what,
 * and whether they agree. Options last because it is the slowest-moving of the
 * three and reads as context for the other two rather than as news.
 *
 * Each panel degrades on its own and reports which venues answered, so a failure
 * in one leaves the other two intact. That is deliberate: the three read
 * different exchanges, and a page that went blank because one feed was blocked
 * would be a worse instrument than the three separate instruments it replaces.
 */
export default function DerivativesPage() {
  return (
    <div className="flex flex-col gap-4">
      <LiquidationsPanel />
      <PerpMatrixPanel />
      <DerivativesPanel />
    </div>
  );
}
