/**
 * How a unit converts to its table's base unit: a linear factor, `{ factor, offset }` for affine units,
 * or a function (with a sibling `fromBase`) for conversions that are neither, like L/100km.
 */
export type ToBase = number | { readonly factor: number; readonly offset: number } | ((value: number) => number);

/** The parts of a unit definition that say how it converts. */
export interface Conversion {
  readonly toBase: ToBase;
  readonly fromBase?: ((base: number) => number) | undefined;
  readonly scale?: string | undefined;
}

/** Whether two units are on one scale, so they convert. Most tables have only the one, unnamed. */
export const sameScale = (a: Conversion, b: Conversion): boolean => a.scale === b.scale;

/** A plain factor (or `{ factor, offset: 0 }`): the only kind that compounds, serves as a subunit and converts exactly. */
export const isLinear = (toBase: ToBase): toBase is number | { readonly factor: number; readonly offset: number } =>
  typeof toBase === 'number' || (typeof toBase === 'object' && toBase.offset === 0);

/** The factor of a linear or affine unit. Callers check `isLinear` (or rule out functions) first. */
export function factorOf(toBase: ToBase): number {
  if (typeof toBase === 'function') throw new Error('quanto: internal error: factorOf called on a function unit.');
  return typeof toBase === 'number' ? toBase : toBase.factor;
}

/** A value in the unit's own terms, expressed in the base unit. */
export function toBaseValue(value: number, unit: Conversion): number {
  const { toBase } = unit;
  if (typeof toBase === 'function') return toBase(value);
  return typeof toBase === 'number' ? value * toBase : value * toBase.factor + toBase.offset;
}

/** A base-unit value, expressed in the unit's own terms. */
export function fromBaseValue(base: number, unit: Conversion): number {
  const { toBase, fromBase } = unit;
  if (typeof toBase === 'function') return fromBase!(base);
  return typeof toBase === 'number' ? base / toBase : (base - toBase.offset) / toBase.factor;
}

/**
 * The number of decimal places in a factor's shortest written form (`0.0254` → 4), or undefined for
 * forms like `1e-7`. Factors are treated as the decimals they're written as.
 */
function decimalPlaces(n: number): number | undefined {
  const s = String(Math.abs(n));
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  return s.split('.')[1]?.length ?? 0;
}

/**
 * Sums `terms` (value × linear factor) and expresses the result in a unit with `targetFactor`.
 *
 * Decimal factors (0.3048, 0.0254) are scaled to integers first, so `5 ft 11 in` is exactly 71 in and
 * 1 in is exactly 25.4 mm. When the scaled integers wouldn't be exact (more than 2^53), it falls back to
 * plain division, accurate to float precision.
 */
export function sumLinear(terms: readonly { readonly value: number; readonly factor: number }[], targetFactor: number): number {
  const places = [targetFactor, ...terms.map((t) => t.factor)].map(decimalPlaces);
  if (places.every((d) => d !== undefined)) {
    const d = Math.max(...(places as number[]));
    const int = (f: number): number => Math.round(f * 10 ** d);
    const ints = [targetFactor, ...terms.map((t) => t.factor)].map(int);
    if (ints.every((i) => Number.isSafeInteger(i) && i !== 0)) {
      const numerator = terms.reduce((sum, t) => sum + t.value * int(t.factor), 0);
      return numerator / int(targetFactor);
    }
  }
  return terms.reduce((sum, t) => sum + (t.value * t.factor) / targetFactor, 0);
}

/**
 * Converts a value between two units of the same table and scale (callers check `sameScale`). Linear units convert exactly (see `sumLinear`);
 * affine and function units go through the base unit. The result can be non-finite (`0 mpg` in L/100km).
 */
export function convertValue(value: number, from: Conversion, to: Conversion): number {
  if (isLinear(from.toBase) && isLinear(to.toBase)) return sumLinear([{ value, factor: factorOf(from.toBase) }], factorOf(to.toBase));
  return fromBaseValue(toBaseValue(value, from), to);
}
