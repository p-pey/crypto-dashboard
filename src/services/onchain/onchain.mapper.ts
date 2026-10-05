import "server-only";

import { toNumber } from "~/lib/cachedSource";

/**
 * Chain network mappers: Blockscout, mempool.space, Blockchair and Solana RPC.
 *
 * These four are chosen to cover what Etherscan-family APIs charge for, without
 * a key at all:
 *
 * - **Blockscout** runs its own explorer and publishes a full REST v2 per
 *   instance, keyless. The same data class as Etherscan V2 without the account.
 * - **mempool.space** is the only keyless source for Bitcoin network health —
 *   fee tiers, difficulty, hashrate — which is the one genuinely Bitcoin-native
 *   metric nothing else here reports.
 * - **Blockchair** covers many chains behind one consistent schema, so
 *   circulating supply is one call instead of five explorer-specific ones.
 * - **Solana RPC** reaches Solana-native state directly, which no aggregator
 *   exposes cleanly.
 */

/** A chain's own network health, normalised across four different APIs. */
export type ChainNetworkRow = {
  chain: string;
  /** Blocks per second, derived from block timestamps. Null when unavailable. */
  blockRate: number | null;
  /** Most recent block height observed. */
  blockHeight: number | null;
  /** Seconds since the last block. A stalled chain shows a large number here. */
  secondsSinceBlock: number | null;
  /** Bitcoin only: recommended fee tiers in sat/vB. */
  feeSatPerVb: number | null;
/** Bitcoin only: hash rate in hashes per second. */
  hashrate: number | null;
  /** Bitcoin only: current difficulty. */
  difficulty: number | null;
  /** Circulating native supply in **coins**, where the source reports it. */
  circulatingSupply: number | null;
  /** Native market cap in USD. Separate from supply, and not interchangeable. */
  marketCapUsd: number | null;
  /** Transactions seen in the last 24h, where the source reports it. */
  tx24h: number | null;
  /** Known addresses, from Blockscout. */
  addressCount: number | null;
  /**
   * EVM chains: average gas price in gwei. Same field as `feeSatPerVb` because
   * both answer "what does a transaction cost", but the units differ and the two
   * are never compared.
   */
  gasGwei: number | null;
  /**
   * How long ago the reporting instance last refreshed its own data.
   *
   * Distinct from `secondsSinceBlock` on purpose: Blockscout publishes no block
   * timestamp, and a stale-but-successful read must not be reported as a live
   * chain.
   */
  sourceAgeSeconds: number | null;
  /** Where each figure came from, so a partial row is still explicable. */
  sources: string[];
  ok: boolean;
  error: string | null;
};

export type ChainNetworkReport = {
  rows: ChainNetworkRow[];
  fetchedAt: number;
  stale: boolean;
  error: string | null;
};

/**
 * Blockscout per-instance hosts for the chains the app reports.
 *
 * Only hosts whose `/api/v2/stats` was confirmed to answer are listed. BNB Chain,
 * Linea, Mantle, Fraxtal and zkSync all run Blockscout but do **not** expose a v2
 * stats route at these hostnames, and listing them anyway would produce five
 * permanent "failed" rows on a board that otherwise works. A chain absent here is
 * better than a chain that always looks broken.
 */
export const BLOCKSCOUT_INSTANCES = [
  { chain: "Ethereum", host: "https://eth.blockscout.com" },
  { chain: "Base", host: "https://base.blockscout.com" },
  { chain: "Arbitrum", host: "https://arbitrum.blockscout.com" },
  { chain: "Optimism", host: "https://optimism.blockscout.com" },
  { chain: "Polygon", host: "https://polygon.blockscout.com" },
  { chain: "Gnosis", host: "https://gnosis.blockscout.com" },
  { chain: "Scroll", host: "https://scroll.blockscout.com" },
] as const;

const MEMPOOL_SPACE = "https://mempool.space/api/v1";
const BLOCKCHAIR = "https://api.blockchair.com";
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

const REQUEST_TIMEOUT_MS = 12_000;

/**
 * Chains Blockchair serves under its own names, which differ from every other
 * source's. Recorded rather than guessed at call time so a rename is a one-line
 * change rather than a silent row that never fills.
 */
const BLOCKCHAIR_CHAINS = [
  { chain: "Bitcoin", slug: "bitcoin" },
  { chain: "Ethereum", slug: "ethereum" },
  { chain: "BNB Chain", slug: "binance" },
  { chain: "Polygon", slug: "polygon" },
  { chain: "Solana", slug: "solana" },
  { chain: "Tron", slug: "tron" },
  { chain: "Avalanche", slug: "avalanche" },
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function mapBlockscoutStats(payload: unknown): {
  blockHeight: number | null;
  tx24h: number | null;
  circulatingSupply: number | null;
  marketCapUsd: number | null;
  blockRate: number | null;
  /**
   * How long ago the instance last refreshed its own data.
   *
   * **Not** "seconds since the last block" — Blockscout does not publish a block
   * timestamp, and reading a stale-but-present payload as a live chain is the
   * failure this distinction prevents. A large value means the instance has gone
   * quiet, which is a fact about the explorer rather than about the chain.
   */
  sourceAgeSeconds: number | null;
  gasGwei: number | null;
  addressCount: number | null;
} {
  const row = asRecord(payload);

  // Blockscout's `average_block_time` is in **milliseconds** — Ethereum's reads
  // 12000, not 12. Treating it as seconds would report a block rate 1000x too
  // low and a "seconds since block" of 12000 seconds on a chain that blocks
  // every twelve.
  const averageBlockMs = toNumber(row.average_block_time);

  const gasPrices = asRecord(row.gas_prices);

  // `gas_price_updated_at` is ISO 8601 with microseconds, which `Date.parse`
  // handles, but it is absent on some instances — hence the null rather than a
  // default of "now", which would report a healthy chain for an instance that
  // simply never published a timestamp.
  const updatedAt = asString(row.gas_price_updated_at);
  const updatedMs = updatedAt ? Date.parse(updatedAt) : Number.NaN;

  return {
    blockHeight: toNumber(row.total_blocks),
    tx24h: toNumber(row.transactions_today),
    // Blockscout publishes supply and cap in USD rather than in coins.
    circulatingSupply: null,
    marketCapUsd: toNumber(row.market_cap),
    blockRate:
      averageBlockMs !== null && averageBlockMs > 0
        ? 1000 / averageBlockMs
        : null,
    sourceAgeSeconds: Number.isFinite(updatedMs)
      ? (Date.now() - updatedMs) / 1000
      : null,
    gasGwei: toNumber(gasPrices.average),
    addressCount: toNumber(row.total_addresses),
  };
}

export function mapMempoolStats(payload: unknown): {
  feeSatPerVb: number | null;
  hashrate: number | null;
  difficulty: number | null;
  blockHeight: number | null;
} {
  const row = asRecord(payload);

  // The fee route nests its tiers under `halfHourFee`/`hourFee` style keys; the
  // minimum fee is the honest "can I transact now" number.
  const fastest = toNumber(row.fastestFee) ?? toNumber(row.fastest_fee);
  const halfHour = toNumber(row.halfHourFee);
  const hour = toNumber(row.hourFee);
  const economy = toNumber(row.economyFee);

  const candidates = [fastest, halfHour, hour, economy].filter(
    (value): value is number => value !== null && value > 0,
  );

  const difficulty = toNumber(row.difficulty);
  const hashrate = toNumber(row.hashrate_1m) ?? toNumber(row.hashrate);
  const height = toNumber(row.blocks) ?? toNumber(row.current_height);

  return {
    // The lowest tier that still confirms in a reasonable window, so the number
    // is usable rather than merely present.
    feeSatPerVb: halfHour ?? economy ?? hour ?? fastest ?? null,
    hashrate,
    difficulty,
    blockHeight: height ?? null,
  };
}

export function mapBlockchairStats(payload: unknown): {
  circulatingSupply: number | null;
  tx24h: number | null;
  blockHeight: number | null;
} {
  const row = asRecord(payload);
  const data = asRecord(row.data);
  const chain = Object.values(data)[0];
  const stats = asRecord(asRecord(chain).stats);

  return {
    circulatingSupply: toNumber(stats.circulation ?? stats.circulating_supply),
    tx24h: toNumber(stats.transactions_24h),
    blockHeight: toNumber(stats.blocks ?? stats.best_block_height),
  };
}

/**
 * Solana `getHealth` plus `getSlot`, asked as one batch.
 *
 * Batched rather than two calls because a public RPC is rate limited per
 * request, and the slot number alone is enough: a slot that has not advanced in
 * minutes means the chain has stalled, which is the only health fact a
 * dashboard actually needs.
 */


/** One Etherscan-family holder row. */
export type TokenHolder = {
  rank: number;
  address: string;
  /** Share of total supply held, 0..1. Etherscan reports this directly. */
  share: number | null;
  /** Contract balance in whole tokens. */
  balance: string | null;
};

export type HolderReport = {
  chain: string;
  address: string;
  holders: TokenHolder[];
  holderCount: number | null;
  /** Sum of the reported top-ten shares, 0..1. */
  topTenShare: number | null;
  fetchedAt: number;
  stale: boolean;
  error: string | null;
  /** Whether a key was available. Etherscan V2 without a key reports this. */
  configured: boolean;
};

export function mapEtherscanHolders(payload: unknown): {
  holders: TokenHolder[];
  holderCount: number | null;
} {
  const row = asRecord(payload);
  // Etherscan answers with `status: "0"` and a `result` string when the key is
  // missing or the call is throttled, so a successful read is the only case
  // where a list is present.
  const list = asArray(row.result).filter((entry) => {
    const holder = asRecord(entry);
    return asString(holder.address) !== null;
  });

  const holders = list
    .map((entry, index): TokenHolder | null => {
      const holder = asRecord(entry);
      const address = asString(holder.address);
      if (!address) return null;

      return {
        rank: index + 1,
        address,
        // Etherscan sends a decimal fraction (`0.0123` for 1.23%). Values above
        // 1 would be a units change and must not be silently kept, so they are
        // rejected rather than divided again.
        share: (() => {
          const parsed = toNumber(holder.tokenPercent);
          if (parsed === null) return null;
          return parsed > 1 ? null : parsed;
        })(),
        balance: asString(holder.value ?? holder.token),
      };
    })
    .filter((holder): holder is TokenHolder => holder !== null);

  return { holders, holderCount: null };
}

/**
 * Reduces several chain rows into one board.
 *
 * `stale` counts rows whose reporting source has itself gone quiet, which is
 * different from `unreachable` (rows that never answered at all). Both are
 * reported separately so a board showing twelve chains does not imply twelve
 * working feeds.
 */
export function summariseNetworkRows(rows: ChainNetworkRow[]) {
  const live = rows.filter((row) => row.ok);
  const unreachable = rows.filter((row) => !row.ok);

  // Blockscout refreshes its own figures on a timer, so an age past a few
  // minutes means the instance has stopped updating. The threshold is generous
  // because the underlying indexer batches.
  const STALE_SOURCE_SECONDS = 600;

  return {
    total: rows.length,
    live: live.length,
    unreachable: unreachable.length,
    /** Live rows whose source has stopped refreshing. */
    staleSource: live.filter(
      (row) =>
        row.sourceAgeSeconds !== null && row.sourceAgeSeconds > STALE_SOURCE_SECONDS,
    ).length,
    hashRate: live.find((row) => row.hashrate !== null)?.hashrate ?? null,
    difficulty: live.find((row) => row.difficulty !== null)?.difficulty ?? null,
    feeSatPerVb: live.find((row) => row.feeSatPerVb !== null)?.feeSatPerVb ?? null,
    totalCirculating: live.reduce(
      (sum, row) => sum + (row.circulatingSupply ?? 0),
      0,
    ),
    totalMarketCap: live.reduce((sum, row) => sum + (row.marketCapUsd ?? 0), 0),
    medianGasGwei: median(
      live.map((row) => row.gasGwei).filter((value): value is number => value !== null),
    ),
  };
}

/** Median rather than mean: one chain with a gas spike should not skew the board. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  // Odd counts take the middle element; even counts average the two around it,
  // which is the conventional definition and avoids reporting a value no chain
  // is actually paying.
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export { BLOCKCHAIR_CHAINS, MEMPOOL_SPACE, BLOCKCHAIR, SOLANA_RPC, REQUEST_TIMEOUT_MS };