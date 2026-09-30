// Money operations: add, subtract, compare, scale, allocate, convert. See DESIGN.md, "Operations (quanto/money)".
// Amounts stay integers in the currency's minor unit; every operation that can produce a fraction
// takes an explicit rounding mode.

import { isKnownCurrency, minorDigits } from '../codecs/money/currencies';
import type { Money } from '../core/types';

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

/**
 * Rounds to an integer with a named mode. Float noise below 15 significant digits is removed first,
 * so `1005 × 1.1` is treated as exactly 1105.5.
 */
export function roundWithMode(x: number, mode: RoundingMode): number {
  const v = Number(x.toPrecision(15));
  const lower = Math.floor(v);
  const fraction = v - lower;
  if (fraction === 0) return v;
  const upper = lower + 1;
  const awayFromZero = v < 0 ? lower : upper;
  const towardZero = v < 0 ? upper : lower;
  switch (mode) {
    case 'ceil':
      return upper;
    case 'floor':
      return lower;
    case 'expand':
      return awayFromZero;
    case 'trunc':
      return towardZero;
    default: {
      if (fraction < 0.5) return lower;
      if (fraction > 0.5) return upper;
      if (mode === 'halfCeil') return upper;
      if (mode === 'halfFloor') return lower;
      if (mode === 'halfExpand') return awayFromZero;
      if (mode === 'halfTrunc') return towardZero;
      return lower % 2 === 0 ? lower : upper;
    }
  }
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

/** Multiplies an amount by a plain number, rounding to a whole minor unit with the given mode. */
export function scale<C extends string>(m: Money<C>, factor: number, options: { readonly rounding: RoundingMode }): Money<C> {
  assertMoney(m, 'scale');
  if (!Number.isFinite(factor)) throw new Error(`quanto: scale got a non-finite factor (${factor}).`);
  return { minorUnits: assertSafe(roundWithMode(m.minorUnits * factor, options.rounding), 'scale'), currency: m.currency };
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
  const exact = m.minorUnits * options.rate * 10 ** shift;
  return { minorUnits: assertSafe(roundWithMode(exact, options.rounding), 'convert'), currency: to };
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
  const total = ratios.reduce((sum, r) => sum + r, 0);
  if (total <= 0) throw new Error('quanto: allocate needs at least one positive ratio.');

  const sign = m.minorUnits < 0 ? -1 : 1;
  const amount = Math.abs(m.minorUnits);
  const shares = ratios.map((r) => Math.floor(Number(((amount * r) / total).toPrecision(15))));
  let remainder = amount - shares.reduce((sum, s) => sum + s, 0);
  for (let i = 0; remainder > 0; i = (i + 1) % shares.length) {
    if (ratios[i]! > 0) {
      shares[i]!++;
      remainder--;
    }
  }
  return shares.map((s) => ({ minorUnits: s === 0 ? 0 : sign * s, currency: m.currency }));
}
