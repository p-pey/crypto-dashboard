import CrossCheckPanel from "~/features/insights/CrossCheckPanel";
import DefiPanel from "~/features/insights/DefiPanel";
import DexPanel from "~/features/insights/DexPanel";
import MacroSeriesPanel from "~/features/insights/MacroSeriesPanel";
import OnchainPanel from "~/features/insights/OnchainPanel";
import PredictionPanel from "~/features/insights/PredictionPanel";
import RotationPanel from "~/features/insights/RotationPanel";

/**
 * Everything `docs/feature-catalog.md` found that is free and keyless.
 *
 * Ordered by how fast the data moves, top to bottom, because that is also the
 * order a reader cares in: sector rotation and the DEX board change minute to
 * minute, macro series change once a business day. Each panel carries its own
 * error and staleness state, so one unreachable source costs one panel rather than
 * the page.
 *
 * No panel on this page writes anything. There is no database in this app and
 * none is introduced here — see `docs/feature-catalog.md` for why that is a
 * property rather than a limitation.
 */
export default function InsightsPage() {
  return (
    <div className="flex flex-col gap-4">
      <RotationPanel />
      <DexPanel />
      <DefiPanel />
      <PredictionPanel />
      <OnchainPanel />
      <CrossCheckPanel />
      <MacroSeriesPanel />
    </div>
  );
}
