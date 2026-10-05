import "server-only";

import { CachedSource, safeRatio, toNumber } from "~/lib/cachedSource";
import { AppInject, AppSignleton } from "~/lib/container";
import { AxiosService } from "~/lib/axios";

import { mapChains, mapOverview } from "./defi.mapper";
import type {
  DefiCex,
  DefiChain,
  DefiHack,
  DefiOverview,
  DefiProtocol,
  StablecoinAsset,
  StablecoinChainRow,
} from "./defi.types";

const LLAMA = "https://api.llama.fi";
const STABLECOINS = "https://stablecoins.llama.fi";

/**
 * TTLs.
 *
 * Chosen against each route's real cost, because DefiLlama's routes differ by
 * two orders of magnitude in payload:
 *
 * - `/overview/fees` is **28 MB**. At a five-minute TTL that is ~6 GB/day, which
 *   is rude and will eventually be throttled. At 30 minutes it is ~1.3 GB/day
 *   and still fresh enough, because a protocol's daily revenue moves in hours.
 * - `/v2/protocols` is 1.3 MB of TVL, which is slow-moving by nature. Hourly.
 * - `/hacks` is 352 KB and changes a handful of times a year. Twelve hours.
 *
 * `docs/market-data.md` already records that the free tiers here are rate
 * limited; this is where that rule turns into numbers.
 */
const OVERVIEW_TTL_MS = 30 * 60_000;
const PROTOCOLS_TTL_MS = 60 * 60_000;
const CHAINS_TTL_MS = 15 * 60_000;
const STABLECOINS_TTL_MS = 15 * 60_000;
const CEX_TTL_MS = 60 * 60_000;
const HACKS_TTL_MS = 12 * 60 * 60_000;

/** DefiLlama answers slowly on the big routes; the axios default is 15s. */
const BIG_ROUTE_TIMEOUT_MS = 25_000;

/**
 * A protocol with its TVL and the derived ratios the board reads.
 *
 * `tvlToMcap` is the one genuinely useful derived figure here: a protocol whose
 * market cap is many multiples of the value locked in it is priced far past its
 * footprint, which is a valuation statement rather than a size one.
 */
export type ProtocolRow = {
  id: string;
  name: string;
  symbol: string | null;
  category: string | null;
  tvl: number | null;
  mcap: number | null;
  tvlToMcap: number | null;
  geckoId: string | null;
  /** Share of this protocol's TVL sitting on its largest chain, 0..1. */
  topChainShare: number | null;
  topChain: string | null;
  chainCount: number;
};

/** Fees for one protocol, keeping gross and net distinct. */
export type FeeRow = {
  name: string;
  slug: string | null;
  category: string | null;
  fees24h: number | null;
  revenue24h: number | null;
  fees30d: number | null;
  revenue30d: number | null;
  feesAllTime: number | null;
  revenueAllTime: number | null;
  change_1d: number | null;
  change_7d: number | null;
  /**
   * Revenue ÷ fees over 30 days — what share of gross the protocol actually
   * keeps. Null when either side is missing rather than zero, since a protocol
   * that pays all of it out and one nobody measured both break the ratio.
   */
  takeRate: number | null;
  chains: string[];
};

export type StablecoinRow = {
  id: string;
  name: string;
  symbol: string;
  circulatingUsd: number | null;
  prevDayUsd: number | null;
  prevWeekUsd: number | null;
  prevMonthUsd: number | null;
  change1d: number | null;
  change7d: number | null;
  change30d: number | null;
  pegMechanism: string | null;
  /** Below 1 means the peg has drifted off its dollar. */
  price: number | null;
  pegDeviation: number | null;
};

export type CexRow = {
  name: string;
  /** What the venue claims it holds, USD. */
  reservesUsd: number | null;
  /** The same after DefiLlama removes known double-counts. */
  cleanReservesUsd: number | null;
  /** Share removed, 0..1. A high value means the headline figure overstates. */
  cleanRatio: number | null;
  inflows24h: number | null;
  inflows7d: number | null;
  inflows30d: number | null;
  spotVolume: number | null;
  derivativesVolume: number | null;
  openInterest: number | null;
  leverage: number | null;
};

export type HackRow = {
  date: number;
  name: string;
  classification: string | null;
  technique: string | null;
  amountUsd: number | null;
  chains: string[];
  bridgeHack: boolean;
  targetType: string | null;
  /** `amount - returnedFunds`, or the full loss when nothing came back. */
  netLossUsd: number | null;
  returnedUsd: number | null;
};

/**
 * The free analytics layer: TVL, fees, revenue, DEX volume, stablecoin supply,
 * exchange reserves and exploit history — all from DefiLlama, with no key and no
 * paid tier.
 *
 * Each dataset is an independent {@link CachedSource} rather than one combined
 * crawl, for a reason that matters: `/overview/fees` is 28 MB and `/hacks` is
 * 352 KB. A panel that only wants hacks should not pay for fees, and a fees
 * fetch that times out must not blank the exploit list.
 *
 * Everything here is deliberately **stateless beyond the in-process cache**.
 * There is no database in this app and none is introduced: a restart re-fetches
 * once, and every TTL is long enough that this is invisible.
 */
@AppSignleton()
export default class DefiService {
  private readonly feesOverview: CachedSource<DefiOverview>;
  private readonly revenueOverview: CachedSource<DefiOverview>;
  private readonly dexsOverview: CachedSource<DefiOverview>;
  private readonly protocolsSource: CachedSource<DefiProtocol[]>;
  private readonly chainsSource: CachedSource<DefiChain[]>;
  private readonly stablecoinsSource: CachedSource<StablecoinAsset[]>;
  private readonly stablecoinChainsSource: CachedSource<StablecoinChainRow[]>;
  private readonly cexSource: CachedSource<DefiCex[]>;
  private readonly hacksSource: CachedSource<DefiHack[]>;

  constructor(@AppInject(AxiosService) private readonly http: AxiosService) {
    const emptyOverview = (): DefiOverview => ({
      total24h: null,
      total7d: null,
      total30d: null,
      totalAllTime: null,
      change_1d: null,
      change_7d: null,
      change_1m: null,
      allChains: [],
      protocols: [],
    });

    const overview = (
      path: string,
      ttlMs: number,
      dataType?: "dailyRevenue",
    ) =>
      new CachedSource<DefiOverview>({
        ttlMs,
        load: async () => {
          const params = new URLSearchParams({
            excludeTotalDataChart: "true",
            excludeTotalDataChartBreakdown: "true",
          });
          if (dataType) params.set("dataType", dataType);

          const { data } = await this.http.get<unknown>(
            `${LLAMA}${path}?${params.toString()}`,
            { timeout: BIG_ROUTE_TIMEOUT_MS },
          );
          return mapOverview(data);
        },
        empty: emptyOverview,
      });

    this.feesOverview = overview("/overview/fees", OVERVIEW_TTL_MS);
    this.revenueOverview = overview(
      "/overview/fees",
      OVERVIEW_TTL_MS,
      "dailyRevenue",
    );
    this.dexsOverview = overview("/overview/dexs", OVERVIEW_TTL_MS);

    this.protocolsSource = new CachedSource<DefiProtocol[]>({
      ttlMs: PROTOCOLS_TTL_MS,
      load: async () => {
        // `/v2/protocols` rather than `/protocols`: the same data at 1.3 MB
        // instead of 9 MB, because the full route carries per-protocol TVL
        // history charts this app never plots.
        const { data } = await this.http.get<unknown>(`${LLAMA}/v2/protocols`, {
          timeout: BIG_ROUTE_TIMEOUT_MS,
        });
        return mapProtocols(data);
      },
      empty: () => [],
    });

    this.chainsSource = new CachedSource<DefiChain[]>({
      ttlMs: CHAINS_TTL_MS,
      load: async () => {
        const { data } = await this.http.get<unknown>(`${LLAMA}/chains`);
        return mapChains(data);
      },
      empty: () => [],
    });

    this.stablecoinsSource = new CachedSource<StablecoinAsset[]>({
      ttlMs: STABLECOINS_TTL_MS,
      load: async () => {
        const { data } = await this.http.get<unknown>(
          `${STABLECOINS}/stablecoins?includePrices=true`,
          { timeout: BIG_ROUTE_TIMEOUT_MS },
        );
        return mapStablecoins(data);
      },
      empty: () => [],
    });

    this.stablecoinChainsSource = new CachedSource<StablecoinChainRow[]>({
      ttlMs: STABLECOINS_TTL_MS,
      load: async () => {
        const { data } = await this.http.get<unknown>(
          `${STABLECOINS}/stablecoinchains`,
        );
        return mapStablecoinChains(data);
      },
      empty: () => [],
    });

    this.cexSource = new CachedSource<DefiCex[]>({
      ttlMs: CEX_TTL_MS,
      load: async () => {
        const { data } = await this.http.get<unknown>(`${LLAMA}/cexs`);
        const payload =
          data && typeof data === "object" && "cexs" in data
            ? (data as { cexs: unknown }).cexs
            : data;
        return mapCexs(payload);
      },
      empty: () => [],
    });

    this.hacksSource = new CachedSource<DefiHack[]>({
      ttlMs: HACKS_TTL_MS,
      load: async () => {
        const { data } = await this.http.get<unknown>(`${LLAMA}/hacks`);
        return mapHacks(data);
      },
      empty: () => [],
    });
  }

  /**
   * Protocol TVL, ranked.
   *
   * `category` filters server-side because DefiLlama supports it as a query
   * parameter, and doing it upstream is both cheaper and more complete than
   * filtering 6,600 rows in memory.
   */
  async getProtocols(
    options: { category?: string; limit?: number; force?: boolean } = {},
  ) {
    const envelope = await this.protocolsSource.read({
      force: options.force,
    });

    let rows = envelope.data.map((protocol): ProtocolRow | null => {
      const tvl = toNumber(protocol.tvl);
      const mcap = toNumber(protocol.mcap);

      // `chainTvls` carries keys like `Ethereum-borrowing` and `staking-Ethereum`
      // alongside plain chain names, so the largest entry is not necessarily a
      // chain. Summing would double count; taking the max single entry would
      // misread a split entry as the whole. The honest read is the largest
      // *plain* chain entry, which is what the concentration figure wants.
      const plainChainTvl = Object.entries(protocol.chainTvls).filter(
        ([key, value]) => !key.includes("-") && toNumber(value) !== null,
      );

      let topChain: string | null = null;
      let topChainTvl = 0;
      for (const [chain, value] of plainChainTvl) {
        const parsed = toNumber(value) ?? 0;
        if (parsed > topChainTvl) {
          topChainTvl = parsed;
          topChain = chain;
        }
      }

      const tvlToMcap = safeRatio(tvl, mcap);

      return {
        id: protocol.id,
        name: protocol.name,
        symbol: protocol.symbol,
        category: protocol.category,
        tvl,
        mcap,
        // A TVL-to-market-cap ratio above 1 is not a modelling error, it is a
        // protocol holding more than its own token is worth, so it is kept.
        tvlToMcap,
        geckoId: protocol.geckoId,
        topChainShare: safeRatio(topChainTvl, tvl),
        topChain,
        chainCount: plainChainTvl.length,
      };
    });

    if (options.category) {
      const wanted = options.category.toLowerCase();
      rows = rows.filter(
        (row): row is ProtocolRow =>
          row !== null &&
          (row.category ?? "").toLowerCase() === wanted,
      );
    }

    const filtered = rows.filter((row): row is ProtocolRow => row !== null);
    filtered.sort((a, b) => (b.tvl ?? -1) - (a.tvl ?? -1));

    return {
      protocols: filtered.slice(0, options.limit ?? 60),
      /** Distinct categories present, so the UI can offer a filter. */
      categories: [...new Set(
        envelope.data
          .map((protocol) => protocol.category)
          .filter((category): category is string => Boolean(category)),
      )].sort(),
      total: filtered.length,
      fetchedAt: envelope.fetchedAt,
      stale: envelope.stale,
      error: envelope.error,
    };
  }

  /**
   * Fees and revenue, kept as separate figures.
   *
   * These are different numbers and conflating them is the most common error in
   * crypto analytics: gross fees are what users paid, revenue is what the
   * protocol kept after passing most of it on. A DEX with $10M of fees and $1M
   * of revenue is a normal, healthy market-maker business, and reporting the
   * first number alone would overstate it tenfold.
   */
  async getFees(options: { force?: boolean } = {}) {
    const [fees, revenue] = await Promise.all([
      this.feesOverview.read({ force: options.force }),
      this.revenueOverview.read({ force: options.force }),
    ]);

    const revenueByName = new Map(
      revenue.data.protocols.map((row) => [row.name, row]),
    );

    const rows = fees.data.protocols
      .map((feeRow): FeeRow | null => {
        // Joining on `name` is the only key both routes share; the revenue route
        // can be missing a protocol the fees route has, in which case its
        // revenue stays null rather than becoming 0.
        const matched = revenueByName.get(feeRow.name);
        if (!feeRow.total24h && !feeRow.total30d && !feeRow.totalAllTime) {
          return null;
        }

        const revenue24h = matched?.total24h ?? null;
        const revenue30d = matched?.total30d ?? null;
        const revenueAllTime = matched?.totalAllTime ?? null;

        return {
          name: feeRow.name,
          slug: feeRow.slug,
          category: feeRow.category,
          fees24h: feeRow.total24h,
          revenue24h,
          fees30d: feeRow.total30d,
          revenue30d,
          feesAllTime: feeRow.totalAllTime,
          revenueAllTime,
          change_1d: feeRow.change_1d,
          change_7d: feeRow.change_7d,
          // 30 days, because a single day is dominated by one token incentive
          // programme and makes a take rate look like noise.
          takeRate: safeRatio(revenue30d, feeRow.total30d),
          chains: [...new Set(feeRow.breakdown24h ? Object.keys(feeRow.breakdown24h) : [])],
        };
      })
      .filter((row): row is FeeRow => row !== null);

    rows.sort((a, b) => (b.fees24h ?? -1) - (a.fees24h ?? -1));

    return {
      protocols: rows.slice(0, 60),
      totals: {
        fees24h: fees.data.total24h,
        fees30d: fees.data.total7d ?? fees.data.total30d,
        revenue24h: revenue.data.total24h,
        revenueAllTime: revenue.data.totalAllTime,
        feesAllTime: fees.data.totalAllTime,
      },
      // Whichever route failed is named; the board must not present one side of
      // the fee/revenue pair as if it were the whole.
      feesStale: fees.stale,
      revenueStale: revenue.stale,
      fetchedAt: Math.max(fees.fetchedAt, revenue.fetchedAt),
      stale: fees.stale || revenue.stale,
      error: fees.error ?? revenue.error,
    };
  }

  /** DEX and options volume by venue, ranked by 24h. */
  async getDexVolume(options: { force?: boolean } = {}) {
    const envelope = await this.dexsOverview.read({ force: options.force });
    const rows = [...envelope.data.protocols].sort(
      (a, b) => (b.total24h ?? -1) - (a.total24h ?? -1),
    );

    return {
      protocols: rows.slice(0, 40).map((row) => ({
        name: row.name,
        slug: row.slug,
        category: row.category,
        volume24h: row.total24h,
        volume7d: row.total7d,
        volume30d: row.total30d,
        volumeAllTime: row.totalAllTime,
        change_1d: row.change_1d,
        change_7d: row.change_7d,
        change_1m: row.change_1m,
        chains: row.breakdown24h ? Object.keys(row.breakdown24h) : [],
      })),
      totals: {
        volume24h: envelope.data.total24h,
        volume30d: envelope.data.total30d,
        volumeAllTime: envelope.data.totalAllTime,
        change_1d: envelope.data.change_1d,
        change_1m: envelope.data.change_1m,
      },
      fetchedAt: envelope.fetchedAt,
      stale: envelope.stale,
      error: envelope.error,
    };
  }

  /** Chain TVL, ranked. The free chain-activity ranking by capital. */
  async getChains(options: { limit?: number; force?: boolean } = {}) {
    const envelope = await this.chainsSource.read({ force: options.force });
    const rows = [...envelope.data]
      .sort((a, b) => (b.tvl ?? -1) - (a.tvl ?? -1))
      .slice(0, options.limit ?? 30);

    return {
      chains: rows,
      fetchedAt: envelope.fetchedAt,
      stale: envelope.stale,
      error: envelope.error,
    };
  }

  /**
   * Stablecoin supply per asset and per chain.
   *
   * Supply growth is a leading liquidity indicator rather than a lagging price
   * reflection: new stablecoins are minted into a chain before the capital
   * there gets deployed. That is why this belongs beside the macro figures and
   * not inside a coin's panel.
   */
  async getStablecoins(options: { force?: boolean } = {}) {
    const [assets, chains] = await Promise.all([
      this.stablecoinsSource.read({ force: options.force }),
      this.stablecoinChainsSource.read({ force: options.force }),
    ]);

    const rows: StablecoinRow[] = assets.data
      .map((asset): StablecoinRow | null => {
        const circulatingUsd = sumPegMap(asset.circulating);
        if (circulatingUsd === null) return null;

        const price = asset.price ?? null;

        return {
          id: asset.id,
          name: asset.name,
          symbol: asset.symbol,
          circulatingUsd,
          prevDayUsd: sumPegMap(asset.circulatingPrevDay),
          prevWeekUsd: sumPegMap(asset.circulatingPrevWeek),
          prevMonthUsd: sumPegMap(asset.circulatingPrevMonth),
          // Percentage change against each earlier read. Null when the earlier
          // read is absent, which is different from a 0% change.
          change1d: percentChange(circulatingUsd, sumPegMap(asset.circulatingPrevDay)),
          change7d: percentChange(circulatingUsd, sumPegMap(asset.circulatingPrevWeek)),
          change30d: percentChange(
            circulatingUsd,
            sumPegMap(asset.circulatingPrevMonth),
          ),
          pegMechanism: asset.pegMechanism,
          price,
          // How far the market price sits off the peg. A stablecoin at 0.97 is
          // telling you something, and rounding it away hides it.
          pegDeviation: price === null ? null : (price - 1) * 100,
        };
      })
      .filter((row): row is StablecoinRow => row !== null);

    rows.sort((a, b) => (b.circulatingUsd ?? 0) - (a.circulatingUsd ?? 0));

    return {
      assets: rows.slice(0, 25),
      chains: chains.data
        .filter((row) => (row.totalUsd ?? 0) > 0)
        .sort((a, b) => (b.totalUsd ?? 0) - (a.totalUsd ?? 0))
        .slice(0, 25),
      totals: {
        circulatingUsd: rows.reduce((sum, row) => sum + (row.circulatingUsd ?? 0), 0),
        change1d: rows.length > 0 ? averageChange(rows, "change1d") : null,
        change7d: rows.length > 0 ? averageChange(rows, "change7d") : null,
        change30d: rows.length > 0 ? averageChange(rows, "change30d") : null,
      },
      fetchedAt: Math.max(assets.fetchedAt, chains.fetchedAt),
      stale: assets.stale || chains.stale,
      error: assets.error ?? chains.error,
    };
  }

  /**
   * Exchange reserves, from the venues' own published figures.
   *
   * `cleanReservesUsd` is the number worth reading. DefiLlama strips assets known
   * to be double-counted across venues' proofs, so the gap between the headline
   * and the clean figure is itself the finding: it says how much of the reported
   * reserve is the same money counted twice.
   */
  async getCexReserves(options: { limit?: number; force?: boolean } = {}) {
    const envelope = await this.cexSource.read({ force: options.force });

    const rows = envelope.data
      .map((cex): CexRow => {
        const reserves = toNumber(cex.currentTvl);
        const clean = toNumber(cex.cleanAssetsTvl);
        return {
          name: cex.name,
          reservesUsd: reserves,
          cleanReservesUsd: clean,
          // 0..1: how much of the headline was removed. Null when either side
          // is missing, because "no data" must not read as "nothing removed".
          cleanRatio: safeRatio(
            clean === null || reserves === null ? null : reserves - clean,
            reserves,
          ),
          inflows24h: toNumber(cex.inflows24h),
          inflows7d: toNumber(cex.inflows7d),
          inflows30d: toNumber(cex.inflows30d),
          spotVolume: toNumber(cex.spotVolume),
          derivativesVolume: toNumber(cex.derivativesVolume),
          openInterest: toNumber(cex.openInterest),
          leverage: toNumber(cex.leverage),
        };
      })
      .sort((a, b) => (b.reservesUsd ?? -1) - (a.reservesUsd ?? -1));

    return {
      exchanges: rows.slice(0, options.limit ?? 25),
      totals: {
        reservesUsd: rows.reduce((sum, row) => sum + (row.reservesUsd ?? 0), 0),
        cleanReservesUsd: rows.reduce(
          (sum, row) => sum + (row.cleanReservesUsd ?? 0),
          0,
        ),
        inflows24h: rows.reduce((sum, row) => sum + (row.inflows24h ?? 0), 0),
      },
      fetchedAt: envelope.fetchedAt,
      stale: envelope.stale,
      error: envelope.error,
    };
  }

  /**
   * Exploit history, newest first.
   *
   * Losses are reported **net of returned funds**. An exploit that stole $40M and
   * returned $30M cost the protocol $10M, and a board that showed the $40M would
   * be measuring publicity rather than damage.
   */
  async getHacks(options: { limit?: number; force?: boolean } = {}) {
    const envelope = await this.hacksSource.read({ force: options.force });

    const rows: HackRow[] = envelope.data
      .map((hack): HackRow => {
        const amount = toNumber(hack.amount);
        const returned = toNumber(hack.returnedFunds);

        return {
          date: toNumber(hack.date) ?? 0,
          name: hack.name,
          classification: hack.classification,
          technique: hack.technique,
          amountUsd: amount,
          chains: Array.isArray(hack.chain) ? hack.chain : [],
          bridgeHack: Boolean(hack.bridgeHack),
          targetType: hack.targetType,
          netLossUsd:
            amount === null
              ? returned === null
                ? null
                : returned
              : amount - (returned ?? 0),
          returnedUsd: returned,
        };
      })
      .sort((a, b) => b.date - a.date);

    const totalLoss = rows.reduce((sum, row) => sum + (row.netLossUsd ?? 0), 0);

    return {
      hacks: rows.slice(0, options.limit ?? 40),
      totals: {
        count: rows.length,
        totalLossUsd: totalLoss,
        largestUsd: rows.reduce(
          (max, row) => Math.max(max, row.netLossUsd ?? 0),
          0,
        ),
        bridgeHacks: rows.filter((row) => row.bridgeHack).length,
      },
      fetchedAt: envelope.fetchedAt,
      stale: envelope.stale,
      error: envelope.error,
    };
  }
}

/** Signed percentage change, or null when either figure is unusable. */
function percentChange(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null) return null;
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Mean of a change column, weighted by supply.
 *
 * An unweighted mean across stablecoins would let a $20M coin moving 40% speak
 * for a $150B one moving 0.1%, so the aggregate is supply-weighted.
 */
function averageChange(
  rows: StablecoinRow[],
  key: "change1d" | "change7d" | "change30d",
): number | null {
  let weighted = 0;
  let weight = 0;

  for (const row of rows) {
    const change = row[key];
    const supply = row.circulatingUsd;
    if (change === null || supply === null) continue;
    weighted += change * supply;
    weight += supply;
  }

  return weight === 0 ? null : weighted / weight;
}

function sumPegMap(map: Record<string, number> | null): number | null {
  if (!map) return null;
  let total = 0;
  let seen = false;
  for (const value of Object.values(map)) {
    if (!Number.isFinite(value)) continue;
    total += value;
    seen = true;
  }
  return seen ? total : null;
}

// ---------------------------------------------------------------- //
// Raw mappers, kept beside the service because DefiLlama shapes vary
// per route and there is no single shared envelope to generalise over.
// ---------------------------------------------------------------- //

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

function mapProtocols(payload: unknown): DefiProtocol[] {
  return asArray(payload).map((value): DefiProtocol => {
    const row = asRecord(value);
    const chainTvls: Record<string, number> = {};
    for (const [key, amount] of Object.entries(asRecord(row.chainTvls))) {
      const parsed = toNumber(amount);
      if (parsed !== null) chainTvls[key] = parsed;
    }

    return {
      id: asString(row.id) ?? "",
      name: asString(row.name) ?? "unknown",
      symbol: asString(row.symbol),
      category: asString(row.category),
      tvl: toNumber(row.tvl),
      chainTvls,
      mcap: toNumber(row.mcap),
      geckoId: asString(row.gecko_id),
    };
  });
}

function mapStablecoins(payload: unknown): StablecoinAsset[] {
  const root = asRecord(payload);
  return asArray(root.peggedAssets).map((value): StablecoinAsset => {
    const row = asRecord(value);
    return {
      id: asString(row.id) ?? "",
      name: asString(row.name) ?? "unknown",
      symbol: asString(row.symbol) ?? "",
      circulating: asNumberMap(row.circulating),
      circulatingPrevDay: asNumberMap(row.circulatingPrevDay),
      circulatingPrevWeek: asNumberMap(row.circulatingPrevWeek),
      circulatingPrevMonth: asNumberMap(row.circulatingPrevMonth),
      pegType: asString(row.pegType),
      pegMechanism: asString(row.pegMechanism),
      price: toNumber(row.price),
    };
  });
}

function mapStablecoinChains(payload: unknown): StablecoinChainRow[] {
  return asArray(payload)
    .map((value): StablecoinChainRow | null => {
      const row = asRecord(value);
      const chain = asString(row.name);
      if (!chain) return null;

      const total = asNumberMap(row.totalCirculatingUSD);
      const dayAgo = asNumberMap(row.totalCirculatingUSDPrevDay);
      const weekAgo = asNumberMap(row.totalCirculatingUSDPrevWeek);
      const monthAgo = asNumberMap(row.totalCirculatingUSDPrevMonth);
      const totalUsd = sumPegMap(total);

      return {
        chain,
        totalCirculatingUsd: total,
        totalUsd,
        // Each comparison is against its own earlier read rather than against
        // the current total, which is what makes these genuine period changes
        // and not the same number three times.
        change_1d: percentChange(totalUsd, sumPegMap(dayAgo)),
        change_7d: percentChange(totalUsd, sumPegMap(weekAgo)),
        change_1m: percentChange(totalUsd, sumPegMap(monthAgo)),
      };
    })
    .filter((row): row is StablecoinChainRow => row !== null);
}

function mapCexs(payload: unknown): DefiCex[] {
  return asArray(payload).map((value): DefiCex => {
    const row = asRecord(value);
    return {
      name: asString(row.name) ?? "unknown",
      slug: asString(row.slug),
      coin: asString(row.coin),
      currentTvl: toNumber(row.currentTvl),
      cleanAssetsTvl: toNumber(row.cleanAssetsTvl),
      inflows24h: toNumber(row.inflows_24h),
      inflows7d: toNumber(row.inflows_1w),
      inflows30d: toNumber(row.inflows_1m),
      spotVolume: toNumber(row.spotVolume),
      openInterest: toNumber(row.oi),
      derivativesVolume: toNumber(row.derivVolume),
      leverage: toNumber(row.leverage),
    };
  });
}

function mapHacks(payload: unknown): DefiHack[] {
  return asArray(payload).map((value): DefiHack => {
    const row = asRecord(value);
    return {
      date: toNumber(row.date) ?? 0,
      name: asString(row.name) ?? "unknown",
      classification: asString(row.classification),
      technique: asString(row.technique),
      amount: toNumber(row.amount),
      chain: Array.isArray(row.chain)
        ? row.chain.filter((c): c is string => typeof c === "string")
        : [],
      bridgeHack: Boolean(row.bridgeHack),
      targetType: asString(row.targetType),
      source: asString(row.source),
      returnedFunds: toNumber(row.returnedFunds),
      defillamaId: asString(row.defillamaId),
    };
  });
}

function asNumberMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, amount] of Object.entries(asRecord(value))) {
    const parsed = toNumber(amount);
    if (parsed !== null) out[key] = parsed;
  }
  return out;
}