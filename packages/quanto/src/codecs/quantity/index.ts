import { defineCodec } from '../../core/define-codec';
import type { Codec, CodecOptions, Issue, ParseOutcome, Quantity, ResolvedCtx } from '../../core/types';
import type { MeasurementSystem } from '../../locale';
import { normalize } from '../../primitives/normalize';
import { formatNumber, readNumber } from '../../primitives/number';
import { convertValue, factorOf, isLinear, sumLinear, toBaseValue, type ToBase } from './convert';

export type { ToBase } from './convert';

/** One unit in a unit table. */
export interface UnitDefinition {
  /**
   * Conversion to the table's base unit: a factor; `{ factor, offset }` for affine units (temperature); or a
   * function, with `fromBase`, for conversions that are neither (`(v) => 100 / v` for L/100km over km/L).
   * Functions must be strictly monotonic inverses of each other; `quantity()` spot-checks both.
   */
  readonly toBase: ToBase;
  /** The inverse of a function `toBase`, and only allowed with one. */
  readonly fromBase?: ((base: number) => number) | undefined;
  /**
   * What people type. The first alias is what `format` prints. Matched case-insensitively, except aliases
   * that differ only by case from another unit's alias (`mW` and `MW`), which match exactly as written.
   */
  readonly aliases: readonly string[];
  /** The unit a trailing bare number takes after this one: `ft` → `in` makes `5'11` read as 5 ft 11 in. */
  readonly subunit?: string | undefined;
}

/** A plain object mapping unit IDs (the stored identifiers) to their definitions. */
export type UnitTable = Readonly<Record<string, UnitDefinition>>;

/** What a bare number means: one unit, or one per measurement system (from the locale's region). */
export type DefaultUnit<U extends string> = U | { readonly us: U; readonly uk: U; readonly metric: U };

/** Options for a quantity codec. */
export interface QuantityOptions<U extends string, C extends U = U> extends CodecOptions<Quantity<C>> {
  /** What a bare number means. Without it, `70` is a `missing_unit` issue. */
  readonly defaultUnit?: DefaultUnit<U> | undefined;
  /** Always convert the parsed value to this unit. Narrows the value type to `Quantity<C>`. */
  readonly canonicalUnit?: C | undefined;
}

/** A quantity codec. It carries its unit table, which the operations in `quanto/quantity` use. */
export interface QuantityCodec<U extends string, C extends U = U> extends Codec<Quantity<C>> {
  readonly units: Readonly<Record<U, UnitDefinition>>;
}

export interface QuantityDefinition<T extends UnitTable, C extends keyof T & string> extends QuantityOptions<keyof T & string, C> {
  readonly id: string;
  readonly units: T;
}

interface Component {
  readonly value: number;
  readonly unit: string | undefined;
}

const exactKey = (alias: string): string => normalize(alias).trim();
const foldedKey = (alias: string): string => exactKey(alias).toLowerCase();

interface AliasEntry {
  readonly key: string;
  readonly unit: string;
  readonly caseSensitive: boolean;
}
const isLetter = (c: string | undefined): boolean => c !== undefined && /\p{L}/u.test(c);

/**
 * Builds the alias index, checking the table at definition time. Aliases match case-insensitively,
 * unless another unit has an alias that differs only by case: then all of those match exactly as written.
 */
function indexAliases(id: string, units: UnitTable): AliasEntry[] {
  const byFolded = new Map<string, Array<{ readonly alias: string; readonly unit: string }>>();
  for (const [unit, def] of Object.entries(units)) {
    if (def.aliases.length === 0) throw new Error(`quanto: unit "${unit}" in codec "${id}" has no aliases. Give it at least one; the first is what format prints.`);
    for (const alias of def.aliases) {
      const folded = foldedKey(alias);
      if (folded === '' || /^[\d.,+-]/.test(folded)) {
        throw new Error(`quanto: alias "${alias}" of unit "${unit}" in codec "${id}" is empty or starts with a digit or sign, so it can't be told apart from the number.`);
      }
      byFolded.set(folded, [...(byFolded.get(folded) ?? []), { alias, unit }]);
    }
    if (def.subunit !== undefined) {
      const sub = units[def.subunit];
      if (!sub) throw new Error(`quanto: subunit "${def.subunit}" of unit "${unit}" in codec "${id}" isn't in the table.`);
      if (!isLinear(def.toBase) || !isLinear(sub.toBase) || factorOf(sub.toBase) >= factorOf(def.toBase)) {
        throw new Error(`quanto: subunit "${def.subunit}" of unit "${unit}" in codec "${id}" must be a smaller unit, and both must be linear (a plain factor).`);
      }
    }
    checkFunctionUnit(id, unit, def);
  }

  const entries: AliasEntry[] = [];
  for (const [folded, group] of byFolded) {
    if (group.every((g) => g.unit === group[0]!.unit)) {
      entries.push({ key: folded, unit: group[0]!.unit, caseSensitive: false });
      continue;
    }
    const owner = new Map<string, string>();
    for (const { alias, unit } of group) {
      const key = exactKey(alias);
      const existing = owner.get(key);
      if (existing !== undefined && existing !== unit) {
        throw new Error(`quanto: alias "${alias}" in codec "${id}" belongs to both "${existing}" and "${unit}". Remove it from one of them.`);
      }
      if (existing === undefined) entries.push({ key, unit, caseSensitive: true });
      owner.set(key, unit);
    }
  }
  return entries.sort((a, b) => b.key.length - a.key.length);
}

const SAMPLES = [0.5, 1, 2, 10, 100];

/**
 * A function unit needs both functions, and they must be strictly monotonic inverses. Checked at a few
 * sample points (skipping any where `toBase` isn't finite): it catches a missing, swapped or wrong
 * inverse, and fixtures remain the real safety net.
 */
function checkFunctionUnit(id: string, unit: string, def: UnitDefinition): void {
  const where = `unit "${unit}" in codec "${id}"`;
  if (typeof def.toBase !== 'function') {
    if (def.fromBase !== undefined) throw new Error(`quanto: ${where} has fromBase but its toBase isn't a function. Remove fromBase, or make toBase a function.`);
    return;
  }
  const { toBase, fromBase } = def;
  if (typeof fromBase !== 'function') throw new Error(`quanto: ${where} has a function toBase but no fromBase function. Add fromBase, its inverse.`);
  const points = SAMPLES.map((x) => ({ x, base: toBase(x) })).filter((p) => Number.isFinite(p.base));
  if (points.length < 2) throw new Error(`quanto: ${where}: toBase isn't finite at the sample points ${SAMPLES.join(', ')}, so it can't be checked.`);
  for (const { x, base } of points) {
    const back = fromBase(base);
    if (!(Math.abs(back - x) <= 1e-9 * Math.max(Math.abs(x), 1))) {
      throw new Error(`quanto: ${where}: fromBase(toBase(${x})) is ${back}, not ${x}. fromBase must be the inverse of toBase.`);
    }
  }
  const rising = points[1]!.base > points[0]!.base;
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.base === points[i - 1]!.base || points[i]!.base > points[i - 1]!.base !== rising) {
      throw new Error(`quanto: ${where}: toBase must be strictly increasing or strictly decreasing.`);
    }
  }
}

/** Definition-time checks of a quantity codec's options. Shared by `quantity()` and `pace()`. */
export function assertQuantityOptions(id: string, units: UnitTable, defaultUnit: DefaultUnit<string> | undefined, canonicalUnit: string | undefined): void {
  assertUnit(id, units, canonicalUnit, 'canonicalUnit');
  if (typeof defaultUnit === 'object') {
    for (const system of ['us', 'uk', 'metric'] as const) assertUnit(id, units, defaultUnit[system], `defaultUnit.${system}`);
  } else assertUnit(id, units, defaultUnit, 'defaultUnit');
}

/** The unit a bare number means under a measurement system, if any. */
export const resolveDefaultUnit = <U extends string>(defaultUnit: DefaultUnit<U> | undefined, system: MeasurementSystem): U | undefined =>
  typeof defaultUnit === 'object' ? defaultUnit[system] : defaultUnit;

/**
 * The structural check of a quantity value: a finite number, a unit in the table (the canonical unit,
 * if set), and a finite base value, so nothing passes that `parse` would reject (`0 L/100km`).
 */
export function checkQuantity(units: UnitTable, canonicalUnit: string | undefined, value: unknown): Array<{ message: string; path?: PropertyKey[] }> {
  if (typeof value !== 'object' || value === null) return [{ message: 'Expected { value, unit }.' }];
  const v = value as Record<string, unknown>;
  const problems: Array<{ message: string; path?: PropertyKey[] }> = [];
  const finite = typeof v.value === 'number' && Number.isFinite(v.value);
  if (!finite) problems.push({ message: 'Expected a finite number.', path: ['value'] });
  if (typeof v.unit !== 'string' || !Object.hasOwn(units, v.unit)) {
    problems.push({ message: `Expected one of the units: ${Object.keys(units).join(', ')}.`, path: ['unit'] });
  } else if (canonicalUnit !== undefined && v.unit !== canonicalUnit) {
    problems.push({ message: `Expected the unit "${canonicalUnit}".`, path: ['unit'] });
  } else if (finite && !Number.isFinite(toBaseValue(v.value as number, units[v.unit]!))) {
    problems.push({ message: `${String(v.value)} ${v.unit} has no value in the table's other units.`, path: ['value'] });
  }
  return problems;
}

function assertUnit(id: string, units: UnitTable, unit: string | undefined, option: string): void {
  if (unit !== undefined && !units[unit]) {
    throw new Error(`quanto: ${option} "${unit}" of codec "${id}" isn't in its unit table. Use one of: ${Object.keys(units).join(', ')}.`);
  }
}

/**
 * Defines a quantity codec from a unit table. Built-in quantity codecs (`length`, `mass`, …) are
 * defined with it; extend a table with an object spread to add units.
 */
export function quantity<const T extends UnitTable, C extends keyof T & string = keyof T & string>(
  definition: QuantityDefinition<T, C>,
): QuantityCodec<keyof T & string, C> {
  type U = keyof T & string;
  const { id, units, defaultUnit, canonicalUnit, schema, format } = definition;
  const aliases = indexAliases(id, units);
  assertQuantityOptions(id, units, defaultUnit, canonicalUnit);
  const exampleAlias = units[Object.keys(units)[0]!]!.aliases[0]!;


  const matchAlias = (s: string, lower: string, at: number): { unit: string; end: number } | undefined => {
    for (const { key, unit, caseSensitive } of aliases) {
      if (!(caseSensitive ? s : lower).startsWith(key, at)) continue;
      let end = at + key.length;
      if (isLetter(key[key.length - 1]) && isLetter(s[end])) continue;
      // "5 ft. 11 in." — a period after a word alias, when it isn't a decimal point.
      if (isLetter(key[key.length - 1]) && s[end] === '.' && !/\d/.test(s[end + 1] ?? '')) end++;
      return { unit, end };
    }
    return undefined;
  };

  const unparseable = (text: string): ParseOutcome<Quantity<C>> => ({
    ok: false,
    issues: [{ code: 'unparseable', message: `Couldn't understand "${text}".` }],
  });

  const parse = (text: string, ctx: ResolvedCtx): ParseOutcome<Quantity<C>> => {
    const s = normalize(text);
    const lower = s.toLowerCase();
    const components: Component[] = [];
    let pos = 0;
    while (pos < s.length) {
      while (s[pos] === ' ') pos++;
      if (pos >= s.length) break;
      if (components.length > 0 && (s[pos] === '-' || s[pos] === '+')) return unparseable(text);
      const n = readNumber(s, ctx, { from: pos });
      if (!n) return unparseable(text);
      pos = n.end;
      while (s[pos] === ' ') pos++;
      const match = matchAlias(s, lower, pos);
      if (match) {
        components.push({ value: n.value, unit: match.unit });
        pos = match.end;
        continue;
      }
      if (pos < s.length) {
        if (!isLetter(s[pos])) return unparseable(text);
        const word = /^[\p{L}\p{M}]+/u.exec(s.slice(pos))![0];
        const issue: Issue = { code: 'unknown_unit', message: `"${word}" isn't a unit this field accepts.` };
        return { ok: false, issues: [issue] };
      }
      components.push({ value: n.value, unit: undefined });
    }
    if (components.length === 0) return unparseable(text);

    // Resolve a trailing bare number: the default unit when alone, the previous unit's subunit otherwise.
    const resolved: Array<{ value: number; unit: string }> = [];
    for (const [i, c] of components.entries()) {
      if (c.unit !== undefined) resolved.push({ value: c.value, unit: c.unit });
      else if (i === 0) {
        const unit = resolveDefaultUnit<string>(defaultUnit, ctx.locale.measurementSystem);
        if (unit === undefined) {
          return { ok: false, issues: [{ code: 'missing_unit', message: `Add a unit, like "${formatNumber(c.value, ctx)} ${exampleAlias}".` }] };
        }
        resolved.push({ value: c.value, unit });
      } else {
        const subunit = units[resolved[i - 1]!.unit]!.subunit;
        if (subunit === undefined) return unparseable(text);
        resolved.push({ value: c.value, unit: subunit });
      }
    }

    // Compound input goes from larger to smaller units, without repeats, and only in linear units.
    for (let i = 1; i < resolved.length; i++) {
      const prev = units[resolved[i - 1]!.unit]!.toBase;
      const cur = units[resolved[i]!.unit]!.toBase;
      if (!isLinear(prev) || !isLinear(cur) || factorOf(cur) >= factorOf(prev)) return unparseable(text);
    }

    const first = resolved[0]!;
    let value: number;
    let unit: string;
    if (resolved.length === 1) {
      value = first.value;
      unit = first.unit;
    } else {
      // Summed into the smallest unit (the last), or straight into a linear canonicalUnit.
      unit = canonicalUnit !== undefined && isLinear(units[canonicalUnit]!.toBase) ? canonicalUnit : resolved[resolved.length - 1]!.unit;
      // The first component's sign applies to the whole: "-5 ft 6 in" is -66 in.
      const sign = first.value < 0 ? -1 : 1;
      value = sumLinear(
        resolved.map((c, i) => ({ value: i === 0 ? c.value : sign * c.value, factor: factorOf(units[c.unit]!.toBase) })),
        factorOf(units[unit]!.toBase),
      );
    }
    // A value with no base value, or none in canonicalUnit, means nothing: "0 L/100km", or "0 mpg" in L/100km.
    const meaningless = (): ParseOutcome<Quantity<C>> => ({
      ok: false,
      issues: [{ code: 'unparseable', message: `"${text}" doesn't correspond to a real value.` }],
    });
    if (!Number.isFinite(toBaseValue(value, units[unit]!))) return meaningless();
    if (canonicalUnit !== undefined && unit !== canonicalUnit) {
      value = convertValue(value, units[unit]!, units[canonicalUnit]!);
      unit = canonicalUnit;
      if (!Number.isFinite(value)) return meaningless();
    }
    const target = unit;
    return { ok: true, value: { value: value === 0 ? 0 : value, unit: target as C } };
  };

  const check = (value: unknown): Array<{ message: string; path?: PropertyKey[] }> => checkQuantity(units, canonicalUnit, value);

  const defaultFormat = (value: Quantity<C>, ctx: ResolvedCtx): string => {
    const alias = units[value.unit]!.aliases[0]!;
    return `${formatNumber(value.value, ctx)}${/^['"°]$/.test(alias) ? '' : ' '}${alias}`;
  };

  const codec = defineCodec<Quantity<C>>({
    id,
    parse,
    format: defaultFormat,
    check,
    options: { schema, format },
  });
  return { ...codec, units: units as Readonly<Record<U, UnitDefinition>> };
}
