import CoinsDataTable from "~/features/coins/CoinsDataTable";
import DerivativesPanel from "~/features/derivatives/DerivativesPanel";
import MarketPulse from "~/features/market/MarketPulse";

export default async function Home() {
  return (
    <div className="flex flex-col gap-4">
      {/* Above the table, not in it: these are market-wide figures and mixing
          them into a per-coin list would invite the reader to compare them row
          by row, which is meaningless. */}
      <MarketPulse />
      <DerivativesPanel />
      <CoinsDataTable />
    </div>
  );
}
