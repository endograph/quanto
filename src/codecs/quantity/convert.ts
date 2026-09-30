/** How a unit converts to its table's base unit: a factor, or a factor and offset for affine units. */
export type ToBase = number | { readonly factor: number; readonly offset: number };

export const factorOf = (toBase: ToBase): number => (typeof toBase === 'number' ? toBase : toBase.factor);
export const offsetOf = (toBase: ToBase): number => (typeof toBase === 'number' ? 0 : toBase.offset);
export const isAffine = (toBase: ToBase): boolean => typeof toBase !== 'number' && toBase.offset !== 0;

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

/** Converts a value between two units of the same table, handling affine units. */
export function convertValue(value: number, from: ToBase, to: ToBase): number {
  if (!isAffine(from) && !isAffine(to)) return sumLinear([{ value, factor: factorOf(from) }], factorOf(to));
  const base = value * factorOf(from) + offsetOf(from);
  return (base - offsetOf(to)) / factorOf(to);
}
