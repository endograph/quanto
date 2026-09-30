// Quantity operations: convert, add, subtract, scale, compare. See DESIGN.md, "Operations (quanto/quantity)".
// Each takes a quantity codec first: it carries the unit table, so unit checks are explicit.

import { convertValue, factorOf, isAffine, offsetOf } from '../codecs/quantity/convert';
import type { UnitDefinition } from '../codecs/quantity';
import type { Quantity } from '../core/types';

/** What operations need from a quantity codec: its id (for messages) and its unit table. */
export interface QuantityTable<U extends string> {
  readonly id: string;
  readonly units: Readonly<Record<U, UnitDefinition>>;
}

/** Relative tolerance for `compare`, on base-unit values. */
export const COMPARE_TOLERANCE = 1e-9;

function unitOf<U extends string>(codec: QuantityTable<U>, q: Quantity<string>, operation: string): UnitDefinition {
  const def = Object.hasOwn(codec.units, q.unit) ? codec.units[q.unit as U] : undefined;
  if (!def) {
    throw new Error(
      `quanto: ${operation} got a value in "${q.unit}", which isn't in the unit table of codec "${codec.id}". Use a codec whose table has it, or validate the value with codec.schema first.`,
    );
  }
  if (typeof q.value !== 'number' || !Number.isFinite(q.value)) {
    throw new Error(`quanto: ${operation} got a non-finite value (${String(q.value)}).`);
  }
  return def;
}

function refuseAffine(codec: QuantityTable<string>, def: UnitDefinition, q: Quantity<string>, operation: string): void {
  if (isAffine(def.toBase)) {
    throw new Error(
      `quanto: ${operation} is refused for "${q.unit}" in codec "${codec.id}": it's an absolute scale with an offset (like °C), so the result would be meaningless. Convert to a scale without an offset first, or compute the difference yourself.`,
    );
  }
}

/** Converts a quantity to another unit of the same table. */
export function convert<U extends string, T extends U>(codec: QuantityTable<U>, q: Quantity<U>, to: T): Quantity<T> {
  const from = unitOf(codec, q, 'convert');
  const target = unitOf(codec, { value: 0, unit: to }, 'convert');
  const value = q.unit === to ? q.value : convertValue(q.value, from.toBase, target.toBase);
  return { value: value === 0 ? 0 : value, unit: to };
}

/** Adds `b` to `a`. The result is in `a`'s unit. Refused for affine units. */
export function add<U extends string, A extends U>(codec: QuantityTable<U>, a: Quantity<A>, b: Quantity<U>): Quantity<A> {
  const da = unitOf(codec, a, 'add');
  const db = unitOf(codec, b, 'add');
  refuseAffine(codec, da, a, 'add');
  refuseAffine(codec, db, b, 'add');
  return { value: a.value + convert(codec, b, a.unit).value, unit: a.unit };
}

/** Subtracts `b` from `a`. The result is in `a`'s unit. Refused for affine units. */
export function subtract<U extends string, A extends U>(codec: QuantityTable<U>, a: Quantity<A>, b: Quantity<U>): Quantity<A> {
  const da = unitOf(codec, a, 'subtract');
  const db = unitOf(codec, b, 'subtract');
  refuseAffine(codec, da, a, 'subtract');
  refuseAffine(codec, db, b, 'subtract');
  const value = a.value - convert(codec, b, a.unit).value;
  return { value: value === 0 ? 0 : value, unit: a.unit };
}

/** Multiplies a quantity by a plain number. Refused for affine units. */
export function scale<U extends string, A extends U>(codec: QuantityTable<U>, a: Quantity<A>, factor: number): Quantity<A> {
  const da = unitOf(codec, a, 'scale');
  refuseAffine(codec, da, a, 'scale');
  if (!Number.isFinite(factor)) throw new Error(`quanto: scale got a non-finite factor (${factor}).`);
  const value = a.value * factor;
  return { value: value === 0 ? 0 : value, unit: a.unit };
}

/**
 * Compares two quantities: -1, 0 or 1. Uses a relative tolerance of 1e-9 on base-unit values, so
 * five feet and sixty inches compare equal despite conversion drift.
 */
export function compare<U extends string>(codec: QuantityTable<U>, a: Quantity<U>, b: Quantity<U>): -1 | 0 | 1 {
  const da = unitOf(codec, a, 'compare');
  const db = unitOf(codec, b, 'compare');
  const x = a.value * factorOf(da.toBase) + offsetOf(da.toBase);
  const y = b.value * factorOf(db.toBase) + offsetOf(db.toBase);
  if (Math.abs(x - y) <= COMPARE_TOLERANCE * Math.max(Math.abs(x), Math.abs(y))) return 0;
  return x < y ? -1 : 1;
}
