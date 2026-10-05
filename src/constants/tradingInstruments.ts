import type { Instrument } from "~/services/trading/trading.types";

/**
 * The instruments this app tracks, and how each venue spells them.
 *
 * The operator asked for a short list rather than every crypto price: Tether,
 * and tokenised gold. That is a deliberate narrowing, so this file is the
 * allowlist the board filters against rather than a suggestion.
 *
 * `GOLD18K` is in the list for the board but is **not tradable**. No Iranian
 * exchange lists a physical 18k gram market — `GOLD18IRT` answers 400 on
 * Nobitex, 422 on Wallex, 404 on Bitpin and Tabdeal — so it is sourced from
 * nerkh.io and appears as a reference row with no order buttons. Treating it as
 * tradeable would mean inventing a venue that does not exist.
 */

export const INSTRUMENTS: Instrument[] = [
  {
    id: "usdt",
    baseAsset: "USDT",
    quoteAsset: "rls",
    labelKey: "irPrice.assets.usdt",
    kind: "stablecoin",
  },
  {
    id: "xaut",
    baseAsset: "XAUT",
    quoteAsset: "rls",
    labelKey: "irPrice.assets.xaut",
    kind: "digital_gold",
  },
  {
    id: "paxg",
    baseAsset: "PAXG",
    quoteAsset: "rls",
    labelKey: "irPrice.assets.paxg",
    kind: "digital_gold",
  },
  {
    id: "gold18k",
    baseAsset: "GOLD18K",
    quoteAsset: "rls",
    labelKey: "nerkh.instruments.GOLD18K",
    kind: "physical_gold",
  },
];

const BY_ID = new Map(INSTRUMENTS.map((row) => [row.id, row]));

export function instrument(id: string): Instrument | undefined {
  return BY_ID.get(id);
}

export function isTradable(id: string): boolean {
  const found = BY_ID.get(id);
  return found !== undefined && found.kind !== "physical_gold";
}

/** Board rows whose base asset is one of the tracked instruments. */
export function isTrackedBaseAsset(base: string): boolean {
  const key = base.trim().toUpperCase();
  return INSTRUMENTS.some((row) => row.baseAsset === key);
}

/**
 * Venues that list each instrument, with the rules for placing an order.
 *
 * Every field here was read off the venues' own metadata endpoints, and the
 * values that matter are the increments:
 *
 * - Rial and Toman markets quote in **whole units**, so a price of 1,058,000,043
 *   has to be sent as 1,058,000,040.
 * - Gold sizes are five or six decimals.
 *
 * `quoteInToman` is the field that makes the board's single Rial price usable.
 * The board shows one number per instrument, but a Wallex or Tabdeal order is
 * denominated in Toman, so the click-to-order path divides by ten on the way
 * down and multiplies on the way back. Getting this wrong is a factor-of-ten
 * order, so it is stated per market rather than inferred from the symbol.
 */
export type VenueMarket = {
  readonly symbol: string;
  readonly tickSize: string;
  readonly stepSize: string;
  readonly minNotional: string | null;
  readonly quoteInToman: boolean;
  /** Why this venue is absent for an instrument, when it is. */
  readonly unavailable?: string;
};

/**
 * Wallex publishes `stepSize` as a **decimal count**, not an increment: XAUT
 * comes back as `"5"` and the live book shows five decimal places, while
 * `tickSize: "0"` for Toman means one whole Toman. Every other venue publishes a
 * real increment. The adapter converts, and the numbers below are the result so
 * that no other layer has to know the quirk exists.
 */
export const WALLEX_STEP_FROM_DECIMALS = (decimals: string): string =>
  decimals === "0" ? "1" : `0.${"0".repeat(Number(decimals) - 1)}1`;

export const VENUE_MARKETS: Record<
  string,
  Partial<Record<string, VenueMarket>>
> = {
  // ------------------------------------------------------------------ //
  // Nobitex - the only venue that quotes Rial markets in actual Rial.
  // ------------------------------------------------------------------ //
  nobitex: {
    usdt: {
      symbol: "USDTIRT",
      tickSize: "10",
      stepSize: "0.01",
      minNotional: "500000",
      quoteInToman: false,
    },
    xaut: {
      symbol: "XAUTIRT",
      tickSize: "10",
      stepSize: "0.00001",
      minNotional: "500000",
      quoteInToman: false,
    },
    paxg: {
      symbol: "PAXGIRT",
      tickSize: "10",
      stepSize: "0.00001",
      minNotional: "500000",
      quoteInToman: false,
    },
    gold18k: {
      symbol: "",
      tickSize: "0",
      stepSize: "0",
      minNotional: null,
      quoteInToman: false,
      unavailable: "No 18k gram market on Nobitex",
    },
  },

  // ------------------------------------------------------------------ //
  // Wallex - quote assets are TMN and USDT only; there is no IRT market.
  // ------------------------------------------------------------------ //
  wallex: {
    usdt: {
      symbol: "USDTTMN",
      tickSize: "1",
      stepSize: "0.01",
      minNotional: "50000",
      quoteInToman: true,
    },
    xaut: {
      symbol: "XAUTTMN",
      tickSize: "1",
      stepSize: "0.00001",
      minNotional: "50000",
      quoteInToman: true,
    },
    paxg: {
      symbol: "PAXGTMN",
      tickSize: "1",
      stepSize: "0.000001",
      minNotional: "50000",
      quoteInToman: true,
    },
    gold18k: {
      symbol: "",
      tickSize: "0",
      stepSize: "0",
      minNotional: null,
      quoteInToman: false,
      unavailable: "No 18k gram market on Wallex",
    },
  },

  // ------------------------------------------------------------------ //
  // Bitpin - `IRT` here is Toman, and the wallet calls the same asset `RIAL`,
  // so the balance layer needs its own alias.
  // ------------------------------------------------------------------ //
  bitpin: {
    usdt: {
      symbol: "USDT_IRT",
      tickSize: "1",
      stepSize: "0.01",
      minNotional: null,
      quoteInToman: true,
    },
    xaut: {
      symbol: "XAUT_IRT",
      tickSize: "1",
      stepSize: "0.00001",
      minNotional: null,
      quoteInToman: true,
    },
    paxg: {
      symbol: "PAXG_IRT",
      tickSize: "1",
      stepSize: "0.00001",
      minNotional: null,
      quoteInToman: true,
    },
    gold18k: {
      symbol: "",
      tickSize: "0",
      stepSize: "0",
      minNotional: null,
      quoteInToman: false,
      unavailable: "No 18k gram market on Bitpin",
    },
  },

  // ------------------------------------------------------------------ //
  // Tabdeal - the only Iranian venue with real perpetuals, and it lists
  // XAUT_USDT and PAXG_USDT on FAPI.
  // ------------------------------------------------------------------ //
  tabdeal: {
    usdt: {
      symbol: "USDT_IRT",
      tickSize: "1",
      stepSize: "0.01",
      minNotional: "50000",
      quoteInToman: true,
    },
    xaut: {
      symbol: "XAUT_IRT",
      tickSize: "1",
      stepSize: "0.000001",
      minNotional: "50000",
      quoteInToman: true,
    },
    paxg: {
      symbol: "PAXG_IRT",
      tickSize: "1",
      stepSize: "0.00001",
      minNotional: "50000",
      quoteInToman: true,
    },
    gold18k: {
      symbol: "",
      tickSize: "0",
      stepSize: "0",
      minNotional: null,
      quoteInToman: false,
      unavailable: "No 18k gram market on Tabdeal",
    },
  },

  bitunix: {
    // The only venue here quoted in USDT rather than Rial.
    usdt: {
      symbol: "USDTUSDT",
      tickSize: "0.01",
      stepSize: "0.0001",
      minNotional: "1",
      quoteInToman: false,
    },
    xaut: {
      symbol: "XAUTUSDT",
      tickSize: "0.01",
      stepSize: "0.00001",
      minNotional: "1",
      quoteInToman: false,
    },
    paxg: {
      symbol: "PAXGUSDT",
      tickSize: "0.01",
      stepSize: "0.000001",
      minNotional: "1",
      quoteInToman: false,
    },
    gold18k: {
      symbol: "",
      tickSize: "0",
      stepSize: "0",
      minNotional: null,
      quoteInToman: false,
      unavailable: "BitUnix does not list 18k gram gold",
    },
  },
};

/**
 * Leveraged markets that actually exist, as opposed to the ones an exchange
 * could in principle offer.
 *
 * Of the four Iranian venues only Tabdeal runs perpetuals, and its gold pairs
 * are the USDT-quoted ones: there is no Rial-settled gold future anywhere,
 * because a leveraged Rial market would require someone to warehouse the risk.
 * Nobitex's margin product covers XAUT/Rial at up to 5x, which is the only way
 * to get leveraged Rial gold.
 */
export const LEVERAGED_MARKETS: Record<
  string,
  Record<string, "margin" | "futures">
> = {
  nobitex: {
    xaut: "margin",
    usdt: "margin",
  },
  wallex: {
    // Margin exists but excludes every gold market.
    usdt: "margin",
  },
  bitpin: {},
  tabdeal: {
    xaut: "futures",
    paxg: "futures",
    usdt: "futures",
  },
  bitunix: {
    xaut: "futures",
    paxg: "futures",
  },
};

export function leverageMode(
  exchange: string,
  instrumentId: string,
): "margin" | "futures" | null {
  return LEVERAGED_MARKETS[exchange]?.[instrumentId] ?? null;
}

/**
 * Nobitex price steps, mirrored from `GET /v2/options`.
 *
 * Held here as a fallback for when that call fails: the alternative is refusing
 * to size an order, which is worse than using a value that has been stable for
 * years. The live endpoint always wins when it answers.
 */
export const NOBITEX_FALLBACK_PRECISION: Record<
  string,
  { amount: string; price: string }
> = {
  USDTIRT: { amount: "0.01", price: "10" },
  XAUTIRT: { amount: "0.00001", price: "10" },
  PAXGIRT: { amount: "0.00001", price: "10" },
  XAUTUSDT: { amount: "0.00001", price: "0.1" },
  PAXGUSDT: { amount: "0.00001", price: "1" },
};
