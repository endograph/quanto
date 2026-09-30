/**
 * How a unit converts to its table's base unit: a linear factor, `{ factor, offset }` for affine units,
 * or a function (with a sibling `fromBase`) for conversions that are neither, like L/100km.
 */
export type ToBase = number | { readonly factor: number; readonly offset: number } | ((value: number) => number);

/** The parts of a unit definition that say how it converts. */
export interface Conversion {
  readonly toBase: ToBase;
  readonly fromBase?: ((base: number) => number) | undefined;
}

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

/** The smallest power of ten that makes `n` an integer, up to 10^15; undefined if none does. */
function decimalScale(n: number): number | undefined {
  for (let d = 0; d <= 15; d++) {
    const scaled = n * 10 ** d;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-6) return d;
  }
  return undefined;
}

/**
 * Sums `terms` (value × linear factor) and expresses the result in a unit with `targetFactor`.
 *
 * Decimal factors (0.3048, 0.0254) are scaled to integers first, so `5 ft 11 in` is exactly 71 in and
 * 1 in is exactly 25.4 mm. Factors that aren't short decimals fall back to plain division.
 */
export function sumLinear(terms: readonly { readonly value: number; readonly factor: number }[], targetFactor: number): number {
  const scales = [targetFactor, ...terms.map((t) => t.factor)].map(decimalScale);
  if (scales.every((d) => d !== undefined)) {
    const d = Math.max(...(scales as number[]));
    const int = (f: number): number => Math.round(f * 10 ** d);
    const numerator = terms.reduce((sum, t) => sum + t.value * int(t.factor), 0);
    return numerator / int(targetFactor);
  }
  return terms.reduce((sum, t) => sum + (t.value * t.factor) / targetFactor, 0);
}

/**
 * Converts a value between two units of the same table. Linear units convert exactly (see `sumLinear`);
 * affine and function units go through the base unit. The result can be non-finite (`0 mpg` in L/100km).
 */
export function convertValue(value: number, from: Conversion, to: Conversion): number {
  if (isLinear(from.toBase) && isLinear(to.toBase)) return sumLinear([{ value, factor: factorOf(from.toBase) }], factorOf(to.toBase));
  return fromBaseValue(toBaseValue(value, from), to);
}
