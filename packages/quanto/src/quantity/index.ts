// Quantity operations: convert and compare. See DESIGN.md, "Operations (quanto/quantity)".
// Each takes a quantity codec first: it carries the unit table, so unit checks are explicit.
// Arithmetic is left to apps, which know whether adding two values means anything in their domain:
//   { value: a.value + convert(len, b, a.unit).value, unit: a.unit }

import { convertValue, sameScale, toBaseValue } from './convert';
import type { UnitDefinition } from './codec';
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

/** The scale's name, for messages. */
const scaleName = (def: UnitDefinition): string => (def.scale === undefined ? 'the default scale' : `scale "${def.scale}"`);

function assertSameScale(codec: QuantityTable<string>, a: Quantity<string>, da: UnitDefinition, b: Quantity<string>, db: UnitDefinition, operation: string): void {
  if (sameScale(da, db)) return;
  throw new Error(
    `quanto: ${operation} got "${a.unit}" (${scaleName(da)}) and "${b.unit}" (${scaleName(db)}) in codec "${codec.id}". ${operation === 'convert' ? "Units on different scales don't convert." : "Units on different scales can't be compared."}`,
  );
}

/** Converts a quantity to another unit of the same table. Throws for a unit on another scale. */
export function convert<U extends string, T extends U>(codec: QuantityTable<U>, q: Quantity<U>, to: T): Quantity<T> {
  const from = unitOf(codec, q, 'convert');
  const target = unitOf(codec, { value: 0, unit: to }, 'convert');
  assertSameScale(codec, q, from, { value: 0, unit: to }, target, 'convert');
  const value = q.unit === to ? q.value : convertValue(q.value, from, target);
  if (!Number.isFinite(value)) {
    throw new Error(`quanto: convert of ${q.value} ${q.unit} to "${to}" in codec "${codec.id}" has no finite result (like 0 mpg in L/100km).`);
  }
  return { value: value === 0 ? 0 : value, unit: to };
}

/**
 * Compares two quantities: -1, 0 or 1. Uses a relative tolerance of 1e-9 on base-unit values, so
 * five feet and sixty inches compare equal despite conversion drift. Throws for units on different scales.
 */
export function compare<U extends string>(codec: QuantityTable<U>, a: Quantity<U>, b: Quantity<U>): -1 | 0 | 1 {
  const da = unitOf(codec, a, 'compare');
  const db = unitOf(codec, b, 'compare');
  assertSameScale(codec, a, da, b, db, 'compare');
  const x = toBaseValue(a.value, da);
  const y = toBaseValue(b.value, db);
  // An infinite base value would compare equal to everything (0 L/100km is infinitely efficient).
  for (const [q, base] of [[a, x], [b, y]] as const) {
    if (!Number.isFinite(base)) {
      throw new Error(`quanto: compare got ${q.value} ${q.unit}, which has no value in the other units of codec "${codec.id}" (like 0 L/100km). Validate it with codec.schema first.`);
    }
  }
  if (Math.abs(x - y) <= COMPARE_TOLERANCE * Math.max(Math.abs(x), Math.abs(y))) return 0;
  return x < y ? -1 : 1;
}
