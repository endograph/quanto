// Odds operations: toDecimal, impliedProbability, convert, compare. See DESIGN.md, "Odds".

import type { Odds, OddsKind } from './types';

/** The structural problem with a value, or undefined when it's well-formed odds. */
export function oddsProblem(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return 'Expected { kind, … }.';
  const v = value as Record<string, unknown>;
  const positiveInteger = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
  switch (v.kind) {
    case 'fractional':
      return positiveInteger(v.numerator) && positiveInteger(v.denominator) ? undefined : 'Expected a positive whole numerator and denominator.';
    case 'decimal':
      return typeof v.value === 'number' && Number.isFinite(v.value) && v.value > 1 ? undefined : 'Expected decimal odds above 1.';
    case 'american':
      return typeof v.value === 'number' && Number.isFinite(v.value) && Math.abs(v.value) >= 100 ? undefined : 'Expected American odds of +100 or more, or -100 or less.';
    default:
      return 'Expected kind "fractional", "decimal" or "american".';
  }
}

function assertOdds(odds: Odds, operation: string): void {
  const problem = oddsProblem(odds);
  if (problem) throw new Error(`quanto: ${operation} got malformed odds (${problem}) Validate them with the codec's schema first.`);
}

const decimalOf = (odds: Odds): number => {
  switch (odds.kind) {
    case 'fractional':
      return 1 + odds.numerator / odds.denominator;
    case 'decimal':
      return odds.value;
    case 'american':
      return odds.value > 0 ? 1 + odds.value / 100 : 1 + 100 / -odds.value;
  }
};

/** Decimal odds, the total return per unit staked: `11/4` is 3.75, `+275` is 3.75, `-200` is 1.5. */
export function toDecimal(odds: Odds): number {
  assertOdds(odds, 'toDecimal');
  return decimalOf(odds);
}

/** The probability the odds imply, ignoring the bookmaker's margin: 1 / decimal. `11/4` is 4/15 (0.2667). */
export function impliedProbability(odds: Odds): number {
  assertOdds(odds, 'impliedProbability');
  return 1 / decimalOf(odds);
}

/**
 * The fraction closest to `x` with a denominator up to 10,000, by continued fractions: 2.75 is 11/4, and
 * 0.3333333333333333 (from 4/3 decimal) is 1/3, rather than a 16-digit decimal fraction.
 */
function toFraction(x: number): { numerator: number; denominator: number } {
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  let r = x;
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(r);
    const [h2, k2] = [a * h1 + h0, a * k1 + k0];
    if (k2 > 10_000) break;
    [h0, h1, k0, k1] = [h1, h2, k1, k2];
    if (Math.abs(x - h1 / k1) <= 1e-9 * Math.max(1, x) || r - a < 1e-12) break;
    r = 1 / (r - a);
  }
  return { numerator: h1, denominator: k1 };
}

/** Odds from decimal odds, in a notation. */
export function fromDecimal(decimal: number, kind: OddsKind): Odds {
  if (!(Number.isFinite(decimal) && decimal > 1)) throw new Error(`quanto: fromDecimal needs decimal odds above 1; got ${decimal}.`);
  switch (kind) {
    case 'decimal':
      return { kind, value: decimal };
    case 'american': {
      const value = decimal >= 2 ? (decimal - 1) * 100 : -100 / (decimal - 1);
      return { kind, value: Math.round(value * 1e9) / 1e9 };
    }
    case 'fractional': {
      const { numerator, denominator } = toFraction(decimal - 1);
      if (numerator === 0) throw new Error(`quanto: decimal odds of ${decimal} have no fraction with a denominator up to 10,000.`);
      return { kind, numerator, denominator };
    }
  }
}

/**
 * The same odds in another notation. Fractional odds come out reduced (`6/4` as decimal and back is
 * `3/2`), and odds converted to a notation they're already in are returned as they are.
 */
export function convert(odds: Odds, kind: OddsKind): Odds {
  assertOdds(odds, 'convert');
  if (odds.kind === kind) return odds;
  if (odds.kind === 'american' && kind === 'fractional') {
    const { numerator, denominator } = odds.value > 0 ? reduce(odds.value, 100) : reduce(100, -odds.value);
    if (Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator)) return { kind, numerator, denominator };
  }
  if (odds.kind === 'fractional' && kind === 'american') {
    const { numerator: n, denominator: d } = odds;
    return { kind, value: n >= d ? (100 * n) / d : (-100 * d) / n };
  }
  return fromDecimal(decimalOf(odds), kind);
}

function reduce(n: number, d: number): { numerator: number; denominator: number } {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = Number.isInteger(n) && Number.isInteger(d) ? gcd(n, d) : 1;
  return { numerator: n / g, denominator: d / g };
}

/**
 * Compares two odds in any notations, by how likely they say the outcome is: -1 when `a` is the shorter
 * price (more likely), 1 when it's longer. Equal within a relative 1e-9, so `11/4`, `3.75` and `+275` are 0.
 */
export function compare(a: Odds, b: Odds): -1 | 0 | 1 {
  assertOdds(a, 'compare');
  assertOdds(b, 'compare');
  const [x, y] = [decimalOf(a), decimalOf(b)];
  if (Math.abs(x - y) <= 1e-9 * Math.max(x, y)) return 0;
  return x < y ? -1 : 1;
}
