import "server-only";

/**
 * DefiLlama's wire shapes, narrowed to what the app reads.
 *
 * Every field is nullable because DefiLlama omits rather than zeroes: a protocol
 * with no 24h revenue reports `0`, but one whose adapter has not run reports
 * `null`, and those mean different things. Mapping `null` to `0` would invent a
 * protocol that earned nothing instead of one nobody measured.
 */

/** A protocol as `/v2/protocols` reports it. */
export type DefiProtocol = {
  id: string;
  name: string;
  symbol: string | null;
  category: string | null;
  /** Total value locked, USD. Null when the protocol has no TVL adapter. */
  tvl: number | null;
  /** Per-chain TVL split, used for the concentration read. */
  chainTvls: Record<string, number>;
  mcap: number | null;
  geckoId: string | null;
};

/** One row of a `/overview/*` breakdown. */
export type DefiOverviewRow = {
  name: string;
  slug: string | null;
  category: string | null;
  total24h: number | null;
  total7d: number | null;
  total30d: number | null;
  totalAllTime: number | null;
  change_1d: number | null;
  change_7d: number | null;
  change_1m: number | null;
  /** `chain -> protocol -> usd`. Null when the caller excluded the breakdown. */
  breakdown24h: Record<string, Record<string, number>> | null;
};

/** The envelope every `/overview/*` route shares. */
export type DefiOverview = {
  total24h: number | null;
  total7d: number | null;
  total30d: number | null;
  totalAllTime: number | null;
  change_1d: number | null;
  change_7d: number | null;
  change_1m: number | null;
  protocols: DefiOverviewRow[];
  allChains: string[];
};

/** A chain's current TVL, from `/chains`. */
export type DefiChain = {
  name: string;
  tvl: number | null;
  tokenSymbol: string | null;
  change_1d: number | null;
  change_7d: number | null;
  change_1m: number | null;
};

/** A stablecoin's circulating supply, from `stablecoins.llama.fi`. */
export type StablecoinAsset = {
  id: string;
  name: string;
  symbol: string;
  /** Circulating value per peg type; the dollar-pegged key is what matters. */
  circulating: Record<string, number>;
  circulatingPrevDay: Record<string, number>;
  circulatingPrevWeek: Record<string, number>;
  circulatingPrevMonth: Record<string, number>;
  pegType: string | null;
  pegMechanism: string | null;
  price: number | null;
};

/** Stablecoin supply split by chain, from `stablecoinchains`. */
export type StablecoinChainRow = {
  chain: string;
  /** Supply per peg type, e.g. `{ peggedUSD: 4_200_000_000 }`. */
  totalCirculatingUsd: Record<string, number>;
  /**
   * The same figures summed across peg types.
   *
   * Carried alongside the map rather than instead of it, because the board wants
   * a single ranked column while the detail wants to know *which* pegs make up
   * a chain's supply.
   */
  totalUsd: number | null;
  change_1d: number | null;
  change_7d: number | null;
  change_1m: number | null;
};

/** An exchange's disclosed reserves, from `/cexs`. */
export type DefiCex = {
  name: string;
  slug: string | null;
  coin: string | null;
  /** What the venue says it holds. */
  currentTvl: number | null;
  /** The same figure with known-double-counted assets removed. */
  cleanAssetsTvl: number | null;
  /** Net movement of assets in, over the window. */
  inflows24h: number | null;
  inflows7d: number | null;
  inflows30d: number | null;
  spotVolume: number | null;
  openInterest: number | null;
  derivativesVolume: number | null;
  /** Open interest ÷ spot volume — how much leverage the venue carries. */
  leverage: number | null;
};

/** One recorded exploit, from `/hacks`. */
export type DefiHack = {
  /** Unix seconds. */
  date: number;
  name: string;
  classification: string | null;
  technique: string | null;
  /** Loss in USD, as estimated at the time. */
  amount: number | null;
  chain: string[];
  bridgeHack: boolean;
  targetType: string | null;
  source: string | null;
  returnedFunds: number | null;
  defillamaId: string | null;
};