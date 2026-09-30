// Quantity operations: convert and compare. See DESIGN.md, "Operations (quanto/quantity)".
// Each takes a quantity codec first: it carries the unit table, so unit checks are explicit.
// Arithmetic is left to apps, which know whether adding two values means anything in their domain:
//   { value: a.value + convert(len, b, a.unit).value, unit: a.unit }

import { convertValue, factorOf, offsetOf } from '../codecs/quantity/convert';
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

/** Converts a quantity to another unit of the same table. */
export function convert<U extends string, T extends U>(codec: QuantityTable<U>, q: Quantity<U>, to: T): Quantity<T> {
  const from = unitOf(codec, q, 'convert');
  const target = unitOf(codec, { value: 0, unit: to }, 'convert');
  const value = q.unit === to ? q.value : convertValue(q.value, from.toBase, target.toBase);
  return { value: value === 0 ? 0 : value, unit: to };
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
