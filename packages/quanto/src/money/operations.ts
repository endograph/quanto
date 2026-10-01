// Money operations: add, subtract, compare, scale, allocate, convert. See DESIGN.md, "Operations".
// Amounts stay integers in the currency's minor unit; every operation that can produce a fraction
// takes an explicit rounding mode.

import { isKnownCurrency, minorDigits } from './currencies';
import type { Money } from './types';
import { decimalFraction, roundFraction, safeMinorUnits } from './exact';

/** `Intl.NumberFormat` rounding mode names. */
export type RoundingMode = 'ceil' | 'floor' | 'expand' | 'trunc' | 'halfCeil' | 'halfFloor' | 'halfExpand' | 'halfTrunc' | 'halfEven';

function assertMoney(m: Money, operation: string): void {
  if (!Number.isSafeInteger(m.minorUnits)) {
    throw new Error(`quanto: ${operation} got minorUnits ${String(m.minorUnits)}, which isn't a safe integer.`);
  }
  if (!isKnownCurrency(m.currency)) {
    throw new Error(`quanto: ${operation} got currency "${m.currency}", which isn't a known ISO 4217 code.`);
  }
}

function assertSameCurrency(a: Money, b: Money, operation: string): void {
  assertMoney(a, operation);
  assertMoney(b, operation);
  if (a.currency !== b.currency) {
    throw new Error(`quanto: ${operation} needs amounts in the same currency, but got ${a.currency} and ${b.currency}. Convert one first with convert().`);
  }
}

function assertSafe(minorUnits: number, operation: string): number {
  if (!Number.isSafeInteger(minorUnits)) throw new Error(`quanto: the result of ${operation} (${minorUnits} minor units) is too large to represent exactly.`);
  return minorUnits === 0 ? 0 : minorUnits;
}

/** Rounds the number's shortest decimal representation with the requested mode. */
export function roundWithMode(x: number, mode: RoundingMode): number {
  if (!Number.isFinite(x)) throw new Error(`quanto: roundWithMode needs a finite number; got ${x}.`);
  const { numerator, denominator } = decimalFraction(x);
  return Number(roundFraction(numerator, denominator, mode));
}

/** Adds two amounts in the same currency. */
export function add<C extends string>(a: Money<C>, b: Money<NoInfer<C>>): Money<C> {
  assertSameCurrency(a, b, 'add');
  return { minorUnits: assertSafe(a.minorUnits + b.minorUnits, 'add'), currency: a.currency };
}

/** Subtracts `b` from `a`, in the same currency. */
export function subtract<C extends string>(a: Money<C>, b: Money<NoInfer<C>>): Money<C> {
  assertSameCurrency(a, b, 'subtract');
  return { minorUnits: assertSafe(a.minorUnits - b.minorUnits, 'subtract'), currency: a.currency };
}

/** Compares two amounts in the same currency: -1, 0 or 1. */
export function compare<C extends string>(a: Money<C>, b: Money<NoInfer<C>>): -1 | 0 | 1 {
  assertSameCurrency(a, b, 'compare');
  return a.minorUnits < b.minorUnits ? -1 : a.minorUnits > b.minorUnits ? 1 : 0;
}

/** Multiplies by the factor's shortest decimal representation, rounding once to a whole minor unit. */
export function scale<C extends string>(m: Money<C>, factor: number, options: { readonly rounding: RoundingMode }): Money<C> {
  assertMoney(m, 'scale');
  if (!Number.isFinite(factor)) throw new Error(`quanto: scale got a non-finite factor (${factor}).`);
  const { numerator, denominator } = decimalFraction(factor);
  const rounded = roundFraction(BigInt(m.minorUnits) * numerator, denominator, options.rounding);
  return { minorUnits: safeMinorUnits(rounded, 'scale'), currency: m.currency };
}

/**
 * Converts to another currency. `rate` is how many major units of `to` one major unit of `m`'s
 * currency buys. The result is rounded to a whole minor unit of `to` with the given mode. quanto
 * never fetches rates.
 */
export function convert<T extends string>(m: Money, to: T, options: { readonly rate: number; readonly rounding: RoundingMode }): Money<T> {
  assertMoney(m, 'convert');
  if (!isKnownCurrency(to)) throw new Error(`quanto: convert got target currency "${to}", which isn't a known ISO 4217 code.`);
  if (!Number.isFinite(options.rate) || options.rate < 0) throw new Error(`quanto: convert needs a finite, non-negative rate; got ${options.rate}.`);
  const shift = minorDigits(to) - minorDigits(m.currency);
  let { numerator, denominator } = decimalFraction(options.rate);
  if (shift >= 0) numerator *= 10n ** BigInt(shift);
  else denominator *= 10n ** BigInt(-shift);
  const rounded = roundFraction(BigInt(m.minorUnits) * numerator, denominator, options.rounding);
  return { minorUnits: safeMinorUnits(rounded, 'convert'), currency: to };
}

/**
 * Splits an amount by ratios without losing a minor unit: each share gets its rounded-down part,
 * and the remainder goes one unit at a time to the shares with non-zero ratios, in order.
 * $10 three ways is 334 / 333 / 333.
 */
export function allocate<C extends string>(m: Money<C>, ratios: readonly number[]): Money<C>[] {
  assertMoney(m, 'allocate');
  if (ratios.length === 0 || ratios.some((r) => !Number.isFinite(r) || r < 0)) {
    throw new Error('quanto: allocate needs at least one ratio, and every ratio must be a finite, non-negative number.');
  }
  const fractions = ratios.map(decimalFraction);
  // Decimal denominators are powers of ten, so the largest is a common denominator.
  const denominator = fractions.reduce((largest, r) => r.denominator > largest ? r.denominator : largest, 1n);
  const weights = fractions.map((r) => r.numerator * (denominator / r.denominator));
  const total = weights.reduce((sum, weight) => sum + weight, 0n);
  if (total === 0n) throw new Error('quanto: allocate needs at least one positive ratio.');

  const sign = m.minorUnits < 0 ? -1n : 1n;
  const amount = BigInt(Math.abs(m.minorUnits));
  const shares = weights.map((weight) => amount * weight / total);
  let remainder = amount - shares.reduce((sum, share) => sum + share, 0n);
  // Each floor loses less than one unit, so one pass over the positive weights suffices.
  for (let i = 0; remainder > 0n; i++) {
    if (weights[i]! > 0n) {
      shares[i]!++;
      remainder--;
    }
  }
  return shares.map((share) => ({ minorUnits: safeMinorUnits(sign * share, 'allocate'), currency: m.currency }));
}
