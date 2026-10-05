import "server-only";

import { toNumber } from "~/lib/cachedSource";

/**
 * DEX mappers for DexScreener and GeckoTerminal.
 *
 * Two sources with genuinely different strengths, used for different things:
 *
 * - **DexScreener** indexes the widest set of pools and its search endpoint
 *   returns the *same token across many pools at once*, which is what makes a
 *   cross-pool arbitrage comparison possible without N sequential calls.
 * - **GeckoTerminal** has the better per-pool OHLCV and trades endpoints, and
 *   normalises chain ids to lowercase slugs (`eth`, `solana`), which is more
 *   pleasant to join on than DexScreener's ids.
 *
 * Both are free and keyless, which is what makes DEX data available at all:
 * there is no free CEX-quality alternative for pool-level figures.
 */

/** DexScreener's chain ids, normalised to the slugs the app displays. */
export const DEX_CHAINS: Record<string, string> = {
  ethereum: "Ethereum",
  bsc: "BNB Chain",
  bnb: "BNB Chain",
  solana: "Solana",
  base: "Base",
  arbitrum: "Arbitrum",
  polygon: "Polygon",
  avalanche: "Avalanche",
  optimism: "Optimism",
  fantom: "Fantom",
  gnosis: "Gnosis",
  "xdai": "Gnosis",
  linea: "Linea",
  scroll: "Scroll",
  cronos: "Cronos",
  zksync: "zkSync Era",
  zksync2: "zkSync Era",
  mantle: "Mantle",
  "mantle-2": "Mantle",
  blast: "Blast",
  "abstract": "Abstract",
  "berachain": "Berachain",
  hyperliquid: "Hyperliquid",
  tron: "Tron",
  celo: "Celo",
  sonic: "Sonic",
  sui: "Sui",
  aptos: "Aptos",
  injective: "Injective",
  osmosis: "Osmosis",
  cardano: "Cardano",
  "polygon-zkevm": "Polygon zkEVM",
  "arbitrum-new": "Arbitrum",
  "ethereum-classic": "Ethereum Classic",
};

export type DexPair = {
  /** DexScreener's own pair id, stable across refreshes. */
  pairId: string;
  chain: string;
  chainId: string;
  dex: string;
  /** Base and quote symbols as the pool quotes them. */
  baseSymbol: string;
  /**
   * The base token's contract (EVM) or mint (Solana) address.
   *
   * The identity of the asset. A symbol is only a label: popular tickers are
   * borrowed by unrelated tokens on other chains constantly, so every
   * comparison in this file joins on this rather than on `baseSymbol`.
   */
  baseAddress: string | null;
  quoteSymbol: string;
  priceUsd: number | null;
  priceNative: number | null;
  change5m: number | null;
  change1h: number | null;
  change6h: number | null;
  change24h: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  /** 24h volume ÷ liquidity. Above 1 means the pool turned over faster than it holds. */
  volumeToLiquidity: number | null;
  /**
   * 24h transaction counts.
   *
   * Carried because buy and sell *counts* alongside buy and sell *volume* reveal
   * something volume alone cannot: a pool can show high volume concentrated in
   * few large trades, which behaves very differently from many small ones.
   */
  txns24h: { buys: number; sells: number; total: number } | null;
  fdv: number | null;
  marketCap: number | null;
  pairCreatedAt: number | null;
  url: string | null;
  info: {
    imageUrl: string | null;
    websites: string[];
    socials: { type: string; url: string }[];
  };
};

/**
 * A spread between two pools of the same asset.
 *
 * Only spreads where the *buy* pool is strictly cheaper than the *sell* pool are
 * returned. That makes every row a real, directionally actionable opportunity
 * rather than a symmetric listing that happens to include a negative number.
 */
export type DexArbitrageRow = {
  /** Display symbol for the traded asset, e.g. `WETH`. */
  symbol: string;
  /** Cheap pool — where you buy. */
  buy: DexArbitragePool;
  /** Expensive pool — where you sell. */
  sell: DexArbitragePool;
  /** Buy at `buy.priceUsd`, sell at `sell.priceUsd`. */
  grossSpreadPercent: number;
  /**
   * The spread after both pools' fees. This is the number that decides whether
   * anything is executable, so it is never omitted — an unadjusted gross spread
   * of 2% against 1.5% of fees is a loss.
   */
  netSpreadPercent: number | null;
  /** Both legs need to clear their own pool's liquidity to be sized. */
  minLiquidityUsd: number | null;
};

export type DexArbitragePool = {
  pairId: string;
  dex: string;
  chain: string;
  priceUsd: number;
  liquidityUsd: number | null;
  url: string | null;
};

/** GeckoTerminal per-pool candles. */
export type DexCandles = {
  pairId: string;
  timeframe: string;
  /** `[timestampSeconds, open, high, low, close, volume]`. */
  candles: number[][];
  fetchedAt: number;
  stale: boolean;
  error: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function chainLabel(chainId: string | null): string {
  if (!chainId) return "unknown";
  return DEX_CHAINS[chainId.toLowerCase()] ?? chainId;
}

/**
 * Maps one DexScreener pair.
 *
 * `volumeToLiquidity` is computed here rather than in the panel because the same
 * figure is used for filtering, ranking and colouring, and deriving it in one
 * place keeps the three consistent.
 */
export function mapDexPair(value: unknown): DexPair | null {
  const row = asRecord(value);
  const base = asRecord(row.baseToken);
  const quote = asRecord(row.quoteToken);

  /**
   * The token's contract or mint address.
   *
   * Carried because a **symbol is not an identity**: dozens of unrelated tokens
   * borrow popular tickers, and any comparison keyed on the ticker will happily
   * match a scam clone of PEPE on some obscure chain against the real one. This
   * is the join key that makes a cross-pool comparison mean something.
   */
  const baseAddress = asString(base.address);

  /**
   * The id field is `pairAddress`, **not** `pairId`.
   *
   * Reading the wrong key returns `undefined` for every pair, which filters the
   * whole board down to zero rows with no error anywhere — the response is a
   * well-formed 200 that simply matched nothing. Confirmed against live
   * responses from `search`, `latest/dex/tokens/{address}` and
   * `latest/dex/pairs/{chain}/{pair}`, all of which use `pairAddress`.
   */
  const pairId = asString(row.pairAddress);

  const priceUsd = toNumber(row.priceUsd);
  // Nested objects are read through `asRecord` rather than by optional chaining:
  // an untyped `row.liquidity` has no known properties, so `row.liquidity?.usd`
  // does not typecheck and would silently yield `undefined` at runtime anyway.
  const liquidity = asRecord(row.liquidity);
  const volume = asRecord(row.volume);
  const priceChange = asRecord(row.priceChange);
  const info = asRecord(row.info);

  const liquidityUsd = toNumber(liquidity.usd);
  const volume24h = toNumber(volume.h24);

  return {
    pairId: pairId ?? "",
    chainId: asString(row.chainId) ?? "",
    chain: chainLabel(asString(row.chainId)),
    dex: asString(row.dexId) ?? "unknown",
    baseSymbol: asString(base.symbol) ?? "???",
    baseAddress,
    quoteSymbol: asString(quote.symbol) ?? "???",
    priceUsd,
    priceNative: toNumber(row.priceNative),
    change5m: toNumber(priceChange.m5),
    change1h: toNumber(priceChange.h1),
    change6h: toNumber(priceChange.h6),
    change24h: toNumber(priceChange.h24),
    liquidityUsd,
    volume24h,
    volumeToLiquidity:
      liquidityUsd && volume24h !== null ? volume24h / liquidityUsd : null,
    txns24h: mapTxns(row.txns),
    fdv: toNumber(row.fdv),
    marketCap: toNumber(row.marketCap),
    pairCreatedAt: toNumber(row.pairCreatedAt),
    url: asString(row.url),
    info: {
      imageUrl: asString(info.imageUrl),
      websites: Array.isArray(info.websites)
        ? info.websites.filter((w: unknown): w is string => typeof w === "string")
        : [],
      socials: Array.isArray(info.socials)
        ? info.socials
            .map((social: unknown) => {
              const entry = asRecord(social);
              const type = asString(entry.type);
              const url = asString(entry.url);
              return type && url ? { type, url } : null;
            })
            .filter((entry): entry is { type: string; url: string } => entry !== null)
        : [],
    },
  };
}

/**
 * DexScreener nests the 24h counts under a `h24` key.
 *
 * `txns` is also the name of the top-level field holding the 5-minute and 1-hour
 * counts, so this reads the `h24` sub-object specifically — reading the whole
 * `txns` field as if it were the 24h figure would silently report hourly counts
 * as daily ones.
 */
function mapTxns(value: unknown): DexPair["txns24h"] {
  const h24 = asRecord(asRecord(value).h24);
  const buys = toNumber(h24.buys);
  const sells = toNumber(h24.sells);

  if (buys === null && sells === null) return null;

  const total = (buys ?? 0) + (sells ?? 0);
  return { buys: buys ?? 0, sells: sells ?? 0, total };
}

/** DexScreener's `pairs` / `pairs` inside a token response. */
export function mapDexPairs(payload: unknown): DexPair[] {
  const root = asRecord(payload);
  const rawPairs = Array.isArray(root.pairs)
    ? root.pairs
    : Object.values(asRecord(root.pairs));

  return rawPairs
    .map(mapDexPair)
    .filter((pair): pair is DexPair => pair !== null && pair.pairId !== "");
}

/**
 * Above this, the two prices are not describing the same asset.
 *
 * A genuine mispricing between two pools of the *same* token settles inside a
 * few percent once arbitrageurs arrive. A 3000% "spread" is a scam token with a
 * borrowed ticker, a pool with no real depth, or a decimal error — and reporting
 * it as an opportunity would be the single most harmful thing this panel could
 * do, because it invites exactly the reader who should not be reading it.
 */
export const MAX_PLAUSIBLE_SPREAD_PERCENT = 50;

/**
 * Finds cross-pool spreads for one asset.
 *
 * **Pools are grouped by chain *and* base-token address, never by symbol.**
 *
 * This is the most important correctness decision in the file. Symbols are not
 * identities: a search for `PEPE` returns the real PEPE on Ethereum at $0.0000043
 * alongside unrelated tokens on Base, Solana and other chains whose developers
 * borrowed the ticker. Comparing across those produces "arbitrage" of several
 * thousand percent, every cent of it fake. Grouping by `chainId` + base token
 * address means two pools are only ever compared when they genuinely hold the
 * same contract, which is the only case where a spread is actionable.
 *
 * Two further decisions:
 *
 * - **Only positive gross spreads are returned.** Showing the negative ones would
 *   make this a list of pools sorted by price rather than a list of opportunities.
 * - **A minimum liquidity floor applies to both legs.** A 40% spread on a $200
 *   pool is a rounding error, not an opportunity.
 *
 * Fees are assumed at 0.3% per side — the UniV3/DefiLlama default — because
 * DexScreener does not publish a per-pool fee. The assumption is applied to both
 * legs and the net figure is what drives the ranking, since quoting only the
 * gross number would be the more profitable lie.
 */
export function findArbitrage(
  pairs: DexPair[],
  options: { minLiquidityUsd?: number; assumedFeePercent?: number } = {},
): DexArbitrageRow[] {
  const minLiquidity = options.minLiquidityUsd ?? 25_000;
  const assumedFeePercent = options.assumedFeePercent ?? 0.3;

  const groups = new Map<string, DexPair[]>();

  for (const pair of pairs) {
    if (pair.priceUsd === null) continue;
    if ((pair.liquidityUsd ?? 0) < minLiquidity) continue;
    // Without a token address the pair cannot be safely identified, so it is
    // excluded rather than matched on its ticker.
    if (!pair.baseAddress) continue;

    const key = `${pair.chainId}:${pair.baseAddress.toLowerCase()}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(pair);
    groups.set(key, bucket);
  }

  const rows: DexArbitrageRow[] = [];

  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;

    // The cheapest and dearest pools only — an interior pair can never be the
    // best side of any spread.
    const sorted = [...bucket].sort((a, b) => (a.priceUsd ?? 0) - (b.priceUsd ?? 0));
    const cheapest = sorted[0];
    const dearest = sorted.at(-1);
    if (!cheapest || !dearest) continue;

    const buy = cheapest.priceUsd ?? 0;
    const sell = dearest.priceUsd ?? 0;
    if (buy <= 0 || sell <= 0) continue;

    const gross = ((sell - buy) / buy) * 100;
    if (gross <= 0) continue;
    // Two pools of one contract cannot legitimately differ by more than this, so
    // anything larger is discarded as bad data rather than reported.
    if (gross > MAX_PLAUSIBLE_SPREAD_PERCENT) continue;

    const net = gross - assumedFeePercent * 2;

    rows.push({
      symbol: cheapest.baseSymbol,
      buy: {
        pairId: cheapest.pairId,
        dex: cheapest.dex,
        chain: cheapest.chain,
        priceUsd: buy,
        liquidityUsd: cheapest.liquidityUsd,
        url: cheapest.url,
      },
      sell: {
        pairId: dearest.pairId,
        dex: dearest.dex,
        chain: dearest.chain,
        priceUsd: sell,
        liquidityUsd: dearest.liquidityUsd,
        url: dearest.url,
      },
      grossSpreadPercent: gross,
      netSpreadPercent: net,
      minLiquidityUsd: Math.min(
        cheapest.liquidityUsd ?? 0,
        dearest.liquidityUsd ?? 0,
      ),
    });
  }

  rows.sort((a, b) => (b.netSpreadPercent ?? -Infinity) - (a.netSpreadPercent ?? -Infinity));

return rows;
}

/** GeckoTerminal OHLCV, filtered to well-formed rows. */
export function mapDexCandles(payload: unknown): number[][] {
  const root = asRecord(payload);
  const list = root.ohlcv_list;
  if (!Array.isArray(list)) return [];

  return list
    .map((row) => (Array.isArray(row) ? row.map((cell) => toNumber(cell) ?? 0) : null))
    .filter((row): row is number[] => row !== null && row.length >= 6)
    .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
}