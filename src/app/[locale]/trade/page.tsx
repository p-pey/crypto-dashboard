import TradeWorkspace from "~/features/trade/TradeWorkspace";

/**
 * The trading workspace.
 *
 * A client component because the whole screen is a live view: a websocket feed,
 * polling balances, and an order form that has to survive a hot reload without
 * losing a half-typed amount.
 */
export default async function TradePage() {
  return <TradeWorkspace />;
}
