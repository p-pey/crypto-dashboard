/**
 * Fixed-point decimal arithmetic for order prices and sizes.
 *
 * Every Iranian exchange rejects an order whose price or amount is not an exact
 * multiple of that market's step. The numbers also overflow the precision a
 * JavaScript double can carry: a Nobitex Rial order may be worth up to
 * 50,000,000,000 while XAUT is sized to 0.00001 tokens, so the notional is
 * routinely the product of a 1e-5 fraction and a 1e10 integer.
 *
 * So nothing here does `number` arithmetic. A value is a `bigint` mantissa plus
 * a decimal scale, every operation is exact, and only the final string that
 * goes on the wire leaves as decimal text. Pure and dependency free, so the
 * same rules run in a test, in a route handler and in a Client Component.
 */

export type Decimal = {
  readonly mantissa: bigint;
  readonly scale: number;
};

const POW10_CACHE = new Map<number, bigint>();

/** 10n ** n, memoised because scaling sits in the hot path of every order. */
function pow10(n: number): bigint {
  const cached = POW10_CACHE.get(n);
  if (cached !== undefined) return cached;
  if (n < 0 || n > 40) throw new RangeError(`pow10 out of range: ${n}`);
  let value = 1n;
  for (let i = 0; i < n; i += 1) value *= 10n;
  POW10_CACHE.set(n, value);
  return value;
}

/** Guards against a hostile payload asking for an unbounded computation. */
const MAX_SCALE = 24;

function assertScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) {
    throw new RangeError(`scale out of range: ${scale}`);
  }
}

function zero(): Decimal {
  return { mantissa: 0n, scale: 0 };
}

/** Truncates `n` trailing mantissa digits, rounding half away from zero. */
function scaleDown(value: Decimal, n: number): Decimal {
  if (n <= 0) return value;
  const divisor = pow10(n);
  const quotient = value.mantissa / divisor;
  const remainder = value.mantissa % divisor;
  const bump = (remainder < 0n ? -remainder : remainder) * 2n >= divisor ? 1n : 0n;
  const scale = value.scale - n;
  if (scale < 0) {
    return { mantissa: (quotient + bump) * pow10(-scale), scale: 0 };
  }
  return { mantissa: quotient + bump, scale };
}

/** Multiplies by 10n ** n, using the scale when n is negative. */
function shift(value: Decimal, n: number): Decimal {
  if (n === 0) return value;
  if (n > 0) return { mantissa: value.mantissa * pow10(n), scale: value.scale };
  return scaleDown(value, -n);
}

function applySign(sign: string | undefined, magnitude: bigint): bigint {
  return sign === "-" ? -magnitude : magnitude;
}

/** Fraction digit count of already-validated decimal text. */
function fractionDigits(text: string): number {
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

/**
 * Goes through the shortest round-trip text form so a double never leaks its
 * binary error into the mantissa (`0.1 + 0.2` style artefacts stop here).
 */
function fromNumber(value: number): Decimal {
  if (Number.isInteger(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) {
    return { mantissa: BigInt(value), scale: 0 };
  }
  return parseDecimal(value.toString());
}

/**
 * Parses decimal text into an exact value.
 *
 * The normalisations exist because of shapes these APIs really emit: Nobitex
 * writes zeroes in scientific notation (`"0E-10"`) and its documented payloads
 * contain a Unicode minus (U+2212). Both become `NaN` in a plain `Number()`.
 */
export function parseDecimal(
  input: string | number | bigint | null | undefined,
): Decimal {
  if (input === null || input === undefined) return zero();
  if (typeof input === "bigint") return { mantissa: input, scale: 0 };
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new RangeError(`not a finite number: ${input}`);
    }
    return fromNumber(input);
  }

  const text = input
    .trim()
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/[\u00a0\u2007\u202f]/g, "")
    .replace(/[,\s]/g, "");

  if (text.length === 0) return zero();

  const scientific = /^([+-]?)(\d+(?:\.\d+)?)[eE]([+-]?\d+)$/.exec(text);
  if (scientific) {
    const sign = scientific[1];
    const mantissaText = scientific[2] ?? "";
    const exponent = Number(scientific[3]);
    const base: Decimal = {
      mantissa: applySign(sign, BigInt(mantissaText.replace(".", ""))),
      scale: fractionDigits(mantissaText),
    };
    return shift(base, exponent);
  }

  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) throw new RangeError(`cannot parse decimal: ${JSON.stringify(input)}`);

  const sign = match[1];
  const whole = match[2] ?? "";
  const fraction = match[3] ?? "";
  if (whole.length === 0 && fraction.length === 0) {
    throw new RangeError(`cannot parse decimal: ${JSON.stringify(input)}`);
  }

  const scale = fraction.length;
  assertScale(scale);
  return {
    mantissa: applySign(sign, BigInt(`${whole || "0"}${fraction}`)),
    scale,
  };
}

/** Parses, returning null instead of throwing on unusable input. */
export function tryParseDecimal(
  input: string | number | bigint | null | undefined,
): Decimal | null {
  try {
    return parseDecimal(input);
  } catch {
    return null;
  }
}

/** Lifts both operands to a common scale so the result stays exact. */
function align(a: Decimal, b: Decimal): { mantissa: bigint; scale: number } {
  const scale = Math.max(a.scale, b.scale);
  return {
    mantissa:
      a.mantissa * pow10(scale - a.scale) + b.mantissa * pow10(scale - b.scale),
    scale,
  };
}

export function add(a: Decimal, b: Decimal): Decimal {
  return align(a, b);
}

export function subtract(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale);
  return {
    mantissa:
      a.mantissa * pow10(scale - a.scale) - b.mantissa * pow10(scale - b.scale),
    scale,
  };
}

/**
 * Exact product. The result keeps both scales, which is what preserves
 * precision. {@link roundToScale} is the only lossy operation in this module
 * and callers must ask for it explicitly.
 */
export function multiply(a: Decimal, b: Decimal): Decimal {
  const scale = a.scale + b.scale;
  assertScale(scale);
  return { mantissa: a.mantissa * b.mantissa, scale };
}

/** Division at a chosen precision; the caller decides how much to keep. */
export function divide(a: Decimal, b: Decimal, resultScale = 18): Decimal {
  if (b.mantissa === 0n) throw new RangeError("division by zero");
  const numerator = a.mantissa * pow10(resultScale + b.scale);
  const denominator = b.mantissa * pow10(a.scale);
  return { mantissa: numerator / denominator, scale: resultScale };
}

/**
 * Orders two values.
 *
 * Both sides are lifted to a shared scale and compared as integers. Note this
 * must not reuse {@link align}, which returns a sum: comparing that against a
 * single operand would report `1.0` as greater than `1`.
 */
export function compare(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const scale = Math.max(a.scale, b.scale);
  const left = a.mantissa * pow10(scale - a.scale);
  const right = b.mantissa * pow10(scale - b.scale);
  if (left > right) return 1;
  if (left < right) return -1;
  return 0;
}

export function equals(a: Decimal, b: Decimal): boolean {
  return compare(a, b) === 0;
}

export function isNegative(value: Decimal): boolean {
  return value.mantissa < 0n;
}

export function abs(value: Decimal): Decimal {
  return value.mantissa < 0n
    ? { mantissa: -value.mantissa, scale: value.scale }
    : value;
}

export function negate(value: Decimal): Decimal {
  return { mantissa: -value.mantissa, scale: value.scale };
}

/**
 * Half-up rounding to an absolute number of decimal places.
 *
 * Widening is exact and just pads the mantissa; narrowing is the lossy branch.
 * Handling both matters because `toFixedString` renders a notional at more
 * places than it was computed at far more often than the reverse.
 */
export function roundToScale(value: Decimal, scale: number): Decimal {
  if (scale === value.scale) return value;
  if (scale > value.scale) {
    return {
      mantissa: value.mantissa * pow10(scale - value.scale),
      scale,
    };
  }
  return scaleDown(value, value.scale - scale);
}

export function min(a: Decimal, b: Decimal): Decimal {
  return compare(a, b) <= 0 ? a : b;
}

export function max(a: Decimal, b: Decimal): Decimal {
  return compare(a, b) >= 0 ? a : b;
}

/**
 * Plain decimal text with exactly `scale` decimal places.
 *
 * Exchanges reject scientific notation in an order body, so `1e-7` is not an
 * acceptable way to send an amount even though it is a legal JS number.
 */
export function toFixedString(value: Decimal, scale = value.scale): string {
  const rounded = roundToScale(value, scale);
  const negative = rounded.mantissa < 0n;
  const magnitude = (negative ? -rounded.mantissa : rounded.mantissa).toString();
  const digits = magnitude.padStart(scale + 1, "0");
  const cut = digits.length - scale;
  const whole = digits.slice(0, cut) || "0";
  const fraction = scale === 0 ? "" : `.${digits.slice(cut)}`;
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

/** Compact form for logs and UI; never for an order body. */
export function toPlainString(value: Decimal): string {
  const text = toFixedString(value, value.scale);
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

/** Lossy bridge for display and chart maths only. */
export function toNumber(value: Decimal): number {
  return Number(toFixedString(value, Math.min(value.scale, 12)));
}

/** True when `n` is 10 ** k for some k, i.e. 1, 10, 100, 0.1, 0.01 ... */
function isPowerOfTen(n: bigint): boolean {
  if (n <= 0n) return false;
  let remaining = n;
  while (remaining % 10n === 0n) remaining /= 10n;
  return remaining === 1n;
}

/**
 * Decimal places implied by a step, e.g. `"0.00001"` -> 5.
 *
 * Returns null unless the step is itself a power of ten, because only then is
 * there an exact grid to snap onto. Every venue here uses powers of ten for
 * price and size increments, but a market added later might not, and quietly
 * pretending otherwise would produce an order the exchange rejects.
 */
export function decimalsOfStep(step: string): number | null {
  const text = step.trim();
  if (!/^\d*(\.\d+)?$/.test(text)) return null;
  const probe = parseDecimal(text);
  if (probe.scale !== fractionDigits(text)) return null;
  return isPowerOfTen(probe.mantissa) ? probe.scale : null;
}

export type Snapped = {
  readonly value: string;
  readonly decimals: number;
  /** False when the step is not a power of ten and nothing could be snapped. */
  readonly exact: boolean;
};

export type SnapMode = "nearest" | "down" | "up";

/**
 * Snaps a value onto an exchange's increment grid.
 *
 * Rial and Toman markets quote in whole units, so a displayed price of
 * 1,058,000,043 has to become 1,058,000,040 rather than being rejected or
 * quietly truncated by the venue. Gold amounts need five or six decimals. Both
 * grids come from the same per-market step.
 *
 * `mode` matters for money the user is committing. A buy amount is snapped
 * `down` so it never costs more than they typed; a sell amount is snapped `down`
 * too, because a sell that cannot be placed is worse than one token less. A
 * price is snapped `nearest`, since the price is the thing the user explicitly
 * asked to hold constant.
 */
export function snapToStep(
  value: Decimal,
  step: string,
  mode: SnapMode = "nearest",
): Snapped {
  const stepText = step.trim();
  const decimals = decimalsOfStep(stepText);

  if (decimals === null) {
    return {
      value: toPlainString(value),
      decimals: value.scale,
      exact: false,
    };
  }

  // Both operands are lifted to a shared integer scale before dividing. Doing it
  // this way rather than at `decimals` is what lets a 1e-5 gold amount step and
  // an integer Rial price step coexist in the same function: neither side ever
  // needs a negative exponent.
  const grid = parseDecimal(stepText);
  const common = Math.max(value.scale, grid.scale);
  const units = value.mantissa * pow10(common - value.scale);
  const stride = grid.mantissa * pow10(common - grid.scale);

  const negative = units < 0n;
  const magnitude = stride < 0n ? -stride : stride;
  const absolute = negative ? -units : units;

  let steps: bigint;
  if (mode === "down") {
    steps = absolute / magnitude;
  } else if (mode === "up") {
    steps = (absolute + magnitude - 1n) / magnitude;
  } else {
    steps = (absolute + magnitude / 2n) / magnitude;
  }

  // `steps` counts multiples of the stride, so the snapped value is the step
  // count multiplied back out, not the count itself.
  const snapped = { mantissa: (negative ? -steps : steps) * stride, scale: common };

  return {
    value: toFixedString(snapped, decimals),
    decimals,
    exact: true,
  };
}

/**
 * Largest step multiple at or below `value`, as a decimal.
 *
 * Used for spendable balance, where rounding up would hand the exchange an
 * order it must reject for insufficient funds.
 */
export function floorToStep(value: Decimal, step: string): Decimal {
  return parseDecimal(snapToStep(value, step, "down").value);
}

/**
 * Trims a decimal to its smallest form, which is what a request body wants.
 *
 * `"1.500000"` and `"1.5"` mean the same price but not every venue parses the
 * first one, and the strict ones validate the string rather than the value.
 */
export function wire(value: Decimal, step?: string): string {
  if (!step) return toPlainString(value);
  const snapped = snapToStep(value, step, "nearest");
  return snapped.exact ? toPlainString(parseDecimal(snapped.value)) : toPlainString(value);
}

/**
 * Coerces an untrusted JSON value to text.
 *
 * `String(value)` on an `unknown` yields `"[object Object]"` for an object, which
 * is how a malformed field silently becomes a bogus order id or an invalid date
 * instead of an obvious absence. Every field read out of an exchange payload
 * goes through here, so an unexpected shape degrades to an empty string the
 * caller already handles.
 *
 * Numbers and booleans are rendered as their natural text; arrays and objects
 * are deliberately dropped rather than serialised, because no field in any of
 * these APIs is ever legitimately a nested structure.
 */
export function textOf(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/**
 * Parses a timestamp field from any of the shapes these venues use.
 *
 * Nobitex and Wallex send ISO strings, Tabdeal sends epoch milliseconds and
 * Bitpin sends ISO strings. A field that is present but unparseable returns
 * null rather than `Date.now()`, so a bad timestamp cannot masquerade as
 * "just now" in an order history.
 */
export function epochOf(value: unknown): number | null {
  const text = textOf(value);
  if (text.length === 0) return null;

  // A bare number is epoch milliseconds.
  if (/^\d+$/.test(text)) {
    const asNumber = Number(text);
    // Seconds would land in 1970; anything that small is meant to be seconds.
    return asNumber < 1e11 ? asNumber * 1000 : asNumber;
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}
