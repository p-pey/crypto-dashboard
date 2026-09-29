import type en from "./en";

/**
 * The dictionary shape is inferred from the English reference file, so `fa`
 * and `de` are exhaustively type checked: a missing or misspelled key fails
 * `tsc` rather than rendering `undefined` at runtime.
 */
export type Dictionary = typeof en;

/**
 * Every dot path that resolves to a leaf string in the dictionary. Feeding
 * `t()` a key that does not exist, or a key that points at an object, is a
 * compile error.
 */
type Leaves<T> = T extends string
  ? ""
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`;
    }[keyof T & string];

export type TranslationKey = Leaves<Dictionary>;

/** Signature of the translation function handed to Client Components. */
export type Translate = (
  key: TranslationKey,
  ...args: (string | number)[]
) => string;

/** Nerkh instrument keys, derived from the reference dictionary so they stay in sync. */
export type InstrumentKey = keyof Dictionary["nerkh"]["instruments"];

/** Sidebar route keys, used to look up nav labels from the dictionary. */
export type NavKey = "markets" | "etfs" | "irPrice" | "analyze";

/** Ant Design status keys reused across the Iranian price widgets. */
export type IrStatusKey = "live" | "connecting" | "stale" | "error";

/** Coin status verdicts, mirrored by `VERDICT_TAG` in the markets table. */
export type VerdictKey = "strong_buy" | "buy" | "neutral" | "reduce" | "avoid";

export type Horizon = "hourly" | "daily" | "weekly" | "monthly" | "yearly";

export type MacroAsset = "usd" | "gold";
