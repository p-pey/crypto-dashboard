import "server-only";

import { CachedSource, describeError, toNumber } from "~/lib/cachedSource";
import { AppInject, AppSignleton } from "~/lib/container";
import { AxiosService } from "~/lib/axios";
import { env } from "~/env";

import {
  BLOCKCHAIR,
  BLOCKCHAIR_CHAINS,
  BLOCKSCOUT_INSTANCES,
  MEMPOOL_SPACE,
  SOLANA_RPC,
  REQUEST_TIMEOUT_MS,
  mapBlockchairStats,
  mapBlockscoutStats,
  mapEtherscanHolders,
  mapMempoolStats,
  summariseNetworkRows,
  type ChainNetworkRow,
  type HolderReport,
} from "./onchain.mapper";

/**
 * Chain network health and token holders, without a database and mostly without
 * a key.
 *
 * Each chain is settled **independently**. That is the whole design: a board
 * showing five chains where two were unreachable must be able to say so, and a
 * shared crawl would either fail entirely or present a partial answer as a
 * complete one. The `sources` array on each row records where its figures came
 * from, so a row filled by one source and a row filled by four are visibly
 * different things.
 *
 * **Etherscan V2 is the one keyed source**, and it is optional: unset, the holder
 * feature reports `configured: false` and the rest of this service is unaffected.
 * One key covers every supported chain, which is what makes it the cheapest way
 * to get holder data if a key is ever wanted.
 */

/** Chain health moves slowly enough that five minutes is a refresh, not a cache. */
const NETWORK_TTL_MS = 5 * 60_000;

/** Holder lists change only as transfers happen; a quarter hour is plenty. */
const HOLDERS_TTL_MS = 15 * 60_000;

/** Etherscan's free tier is rate limited, so holders are cached per chain. */
const ETHERSCAN_BASE = "https://api.etherscan.io/v2/api";

@AppSignleton()
export default class OnchainService {
  private readonly network: CachedSource<ChainNetworkRow[]>;

  /** Keyed `chain:address`, bounded the same way the other caches are. */
  private readonly holders = new Map<string, CachedSource<HolderReport>>();

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {
    this.network = new CachedSource<ChainNetworkRow[]>({
      ttlMs: NETWORK_TTL_MS,
      load: async () => this.loadNetworkRows(),
      empty: () => [],
    });
  }

  /**
   * Network health across every source, each chain settled on its own.
   *
   * The three groups are gathered concurrently — Blockscout per instance,
   * Blockchair across chains, mempool.space for Bitcoin, Solana RPC directly —
   * and a failure in one never removes another's row.
   */
  private async loadNetworkRows(): Promise<ChainNetworkRow[]> {
    const rows = new Map<string, ChainNetworkRow>();

    const ensure = (chain: string): ChainNetworkRow => {
      const existing = rows.get(chain);
      if (existing) return existing;
      const created: ChainNetworkRow = {
        chain,
        blockRate: null,
        blockHeight: null,
        secondsSinceBlock: null,
feeSatPerVb: null,
      gasGwei: null,
      hashrate: null,
      difficulty: null,
      circulatingSupply: null,
      marketCapUsd: null,
      tx24h: null,
      addressCount: null,
      sourceAgeSeconds: null,
      sources: [],
      ok: false,
      error: null,
    };
      rows.set(chain, created);
      return created;
    };

    /** Records a source's figures onto a chain row and marks it live. */
    const apply = (
      chain: string,
      source: string,
      figures: Partial<
        Omit<ChainNetworkRow, "chain" | "sources" | "ok" | "error">
      >,
      error: string | null,
    ) => {
      const row = ensure(chain);
      if (error) {
        row.error = row.error ?? error;
        // A row reached by another source stays live: one source failing is not
        // the chain failing.
        if (row.sources.length > 0) row.ok = true;
        return;
      }
      for (const [key, value] of Object.entries(figures)) {
        if (value !== null && value !== undefined) {
          (row as unknown as Record<string, unknown>)[key] = value;
        }
      }
      row.sources.push(source);
      row.ok = true;
      row.error = null;
    };

    await Promise.all([
      // Blockscout, keyless, one instance per chain.
      ...BLOCKSCOUT_INSTANCES.map(async ({ chain, host }) => {
        try {
          const { data } = await this.http.get<unknown>(
            `${host}/api/v2/stats`,
            { timeout: REQUEST_TIMEOUT_MS },
          );
          apply(chain, "Blockscout", mapBlockscoutStats(data), null);
        } catch (error) {
          apply(chain, "Blockscout", {}, describeError(error));
        }
      }),

      // Blockchair, one schema across many chains.
      ...BLOCKCHAIR_CHAINS.map(async ({ chain, slug }) => {
        try {
          const { data } = await this.http.get<unknown>(
            `${BLOCKCHAIR}/${slug}/stats`,
            { timeout: REQUEST_TIMEOUT_MS },
          );
          apply(chain, "Blockchair", mapBlockchairStats(data), null);
        } catch (error) {
          apply(chain, "Blockchair", {}, describeError(error));
        }
      }),

      // Bitcoin network health. mempool.space is the only keyless source for
      // hashrate and difficulty, so this row is not reproducible without it.
      (async () => {
        try {
          const { data } = await this.http.get<unknown>(
            `${MEMPOOL_SPACE}/v1/fees/mempool`,
            { timeout: REQUEST_TIMEOUT_MS },
          );
          const stats = mapMempoolStats(data);
          apply(
            "Bitcoin",
            "mempool.space",
            {
              feeSatPerVb: stats.feeSatPerVb,
              hashrate: stats.hashrate,
              difficulty: stats.difficulty,
              blockHeight: stats.blockHeight,
            },
            null,
          );
        } catch (error) {
          apply("Bitcoin", "mempool.space", {}, describeError(error));
        }
      })(),

      // Solana, asked directly. A single slot number is enough to tell a live
      // chain from a stalled one.
      (async () => {
        try {
          const { data } = await this.http.post<unknown>(
            SOLANA_RPC,
            { jsonrpc: "2.0", id: 1, method: "getSlot", params: [] },
            {
              timeout: REQUEST_TIMEOUT_MS,
              headers: { "Content-Type": "application/json" },
            },
          );
          const slot = toNumber((data as { result?: unknown })?.result);
          if (slot === null) {
            apply("Solana", "Solana RPC", {}, "no slot returned");
          } else {
            // Only the slot is reported. Solana's RPC does not publish a block
            // rate or a block timestamp, and inferring either from a target
            // interval would be reporting the protocol's specification rather
            // than what the chain is doing.
            apply("Solana", "Solana RPC", { blockHeight: slot }, null);
          }
        } catch (error) {
          apply("Solana", "Solana RPC", {}, describeError(error));
        }
      })(),
    ]);

    return [...rows.values()].sort((a, b) => a.chain.localeCompare(b.chain));
  }

  async getNetworkReport(options: { force?: boolean } = {}) {
    const envelope = await this.network.read({ force: options.force });

    return {
      rows: envelope.data,
      summary: summariseNetworkRows(envelope.data),
      fetchedAt: envelope.fetchedAt,
      stale: envelope.stale,
      error: envelope.error,
    };
  }

  /**
   * Top token holders for a coin on a chain, via Etherscan V2.
   *
   * The one keyed path in this service. With no key it reports
   * `configured: false` and an empty list rather than throwing, so the panel
   * renders as unavailable instead of breaking the page around it.
   */
  async getHolders(
    input: { address: string; chainId: number },
    options: { force?: boolean } = {},
  ): Promise<HolderReport> {
    const apiKey = env.ETHERSCAN_API_KEY;

    if (!apiKey) {
      return {
        chain: input.chainId === 1 ? "Ethereum" : `chain ${input.chainId}`,
        address: input.address,
        holders: [],
        holderCount: null,
        topTenShare: null,
        fetchedAt: Date.now(),
        stale: false,
        error: null,
        configured: false,
      };
    }

    const key = `${input.chainId}:${input.address.toLowerCase()}`;
    const source = this.holdersSource(key, input, apiKey);
    const envelope = await source.read({ force: options.force });

    return { ...envelope.data, configured: true };
  }

  private holdersSource(
    key: string,
    input: { address: string; chainId: number },
    apiKey: string,
  ): CachedSource<HolderReport> {
    const existing = this.holders.get(key);
    if (existing) return existing;

    const created = new CachedSource<HolderReport>({
      ttlMs: HOLDERS_TTL_MS,
      load: async () => {
        const params = new URLSearchParams({
          chainid: String(input.chainId),
          module: "token",
          action: "topholders",
          contractaddress: input.address,
          page: "1",
          offset: "100",
          apikey: apiKey,
        });

        const { data } = await this.http.get<unknown>(
          `${ETHERSCAN_BASE}?${params.toString()}`,
          { timeout: REQUEST_TIMEOUT_MS },
        );

        const { holders } = mapEtherscanHolders(data);

        if (holders.length === 0) {
          // Etherscan signals a missing key, a throttled call and a bad address
          // all with `status: "0"`, so this is thrown to reach the stale path
          // with the message Etherscan gave rather than a generic one.
          const message = extractEtherscanMessage(data);
          throw new Error(message ?? "Etherscan returned no holders");
        }

        const topTenShare = holders
          .slice(0, 10)
          .reduce((sum, holder) => sum + (holder.share ?? 0), 0);

        return {
          chain: chainNameForId(input.chainId),
          address: input.address,
          holders,
          holderCount: holders.length,
          topTenShare: topTenShare > 0 ? topTenShare : null,
          fetchedAt: Date.now(),
          stale: false,
          error: null,
          configured: true,
        };
      },
      staleWhileRefreshing: true,
      empty: () => ({
        chain: chainNameForId(input.chainId),
        address: input.address,
        holders: [],
        holderCount: null,
        topTenShare: null,
        fetchedAt: Date.now(),
        stale: true,
        error: "holders unavailable",
        configured: true,
      }),
    });

    if (this.holders.size >= 100) {
      const oldest = this.holders.keys().next();
      if (!oldest.done) this.holders.delete(oldest.value);
    }

    this.holders.set(key, created);
    return created;
  }
}

/** Etherscan's own failure text, which is more useful than any paraphrase. */
function extractEtherscanMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as { result?: unknown; message?: unknown };
  if (typeof row.result === "string") return row.result;
  if (typeof row.message === "string") return row.message;
  return null;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  56: "BNB Chain",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
  43114: "Avalanche",
  10: "Optimism",
  250: "Fantom",
  59144: "Linea",
  534352: "Scroll",
  324: "zkSync Era",
  1284: "Moonbeam",
};

function chainNameForId(chainId: number): string {
  return CHAIN_NAMES[chainId] ?? `chain ${chainId}`;
}