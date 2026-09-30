import { defineCodec } from '../../core/define-codec';
import type { Codec, CodecOptions, Issue, ParseOutcome, Quantity, ResolvedCtx } from '../../core/types';
import type { MeasurementSystem } from '../../locale';
import { normalize } from '../../primitives/normalize';
import { formatNumber, readNumber } from '../../primitives/number';
import { convertValue, factorOf, isAffine, sumLinear, type ToBase } from './convert';

export type { ToBase } from './convert';

/** One unit in a unit table. */
export interface UnitDefinition {
  /** Conversion to the table's base unit: a factor, or `{ factor, offset }` for affine units (temperature). */
  readonly toBase: ToBase;
  /** What people type. Matched case-insensitively. The first alias is what `format` prints. */
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

const aliasKey = (alias: string): string => normalize(alias).trim().toLowerCase();
const isLetter = (c: string | undefined): boolean => c !== undefined && /\p{L}/u.test(c);

/** Builds the alias index, checking the table at definition time. */
function indexAliases(id: string, units: UnitTable): Array<{ readonly key: string; readonly unit: string }> {
  const owner = new Map<string, string>();
  for (const [unit, def] of Object.entries(units)) {
    if (def.aliases.length === 0) throw new Error(`quanto: unit "${unit}" in codec "${id}" has no aliases. Give it at least one; the first is what format prints.`);
    for (const alias of def.aliases) {
      const key = aliasKey(alias);
      if (key === '' || /^[\d.,+-]/.test(key)) {
        throw new Error(`quanto: alias "${alias}" of unit "${unit}" in codec "${id}" is empty or starts with a digit or sign, so it can't be told apart from the number.`);
      }
      const existing = owner.get(key);
      if (existing !== undefined && existing !== unit) {
        throw new Error(
          `quanto: alias "${alias}" in codec "${id}" belongs to both "${existing}" and "${unit}" (aliases match case-insensitively). Remove it from one of them.`,
        );
      }
      owner.set(key, unit);
    }
    if (def.subunit !== undefined) {
      const sub = units[def.subunit];
      if (!sub) throw new Error(`quanto: subunit "${def.subunit}" of unit "${unit}" in codec "${id}" isn't in the table.`);
      if (isAffine(def.toBase) || factorOf(sub.toBase) >= factorOf(def.toBase)) {
        throw new Error(`quanto: subunit "${def.subunit}" of unit "${unit}" in codec "${id}" must be a smaller, non-affine unit.`);
      }
    }
  }
  return [...owner].map(([key, unit]) => ({ key, unit })).sort((a, b) => b.key.length - a.key.length);
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
  assertUnit(id, units, canonicalUnit, 'canonicalUnit');
  if (typeof defaultUnit === 'object') {
    for (const system of ['us', 'uk', 'metric'] as const) assertUnit(id, units, defaultUnit[system], `defaultUnit.${system}`);
  } else assertUnit(id, units, defaultUnit, 'defaultUnit');
  const exampleAlias = units[Object.keys(units)[0]!]!.aliases[0]!;

  const resolveDefault = (system: MeasurementSystem): string | undefined =>
    typeof defaultUnit === 'object' ? defaultUnit[system] : defaultUnit;

  const matchAlias = (lower: string, at: number): { unit: string; end: number } | undefined => {
    for (const { key, unit } of aliases) {
      if (!lower.startsWith(key, at)) continue;
      let end = at + key.length;
      if (isLetter(key[key.length - 1]) && isLetter(lower[end])) continue;
      // "5 ft. 11 in." — a period after a word alias, when it isn't a decimal point.
      if (isLetter(key[key.length - 1]) && lower[end] === '.' && !/\d/.test(lower[end + 1] ?? '')) end++;
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
      const match = matchAlias(lower, pos);
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
        const unit = resolveDefault(ctx.locale.measurementSystem);
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

    // Compound input goes from larger to smaller units, without repeats or affine units.
    for (let i = 1; i < resolved.length; i++) {
      const prev = units[resolved[i - 1]!.unit]!.toBase;
      const cur = units[resolved[i]!.unit]!.toBase;
      if (isAffine(prev) || isAffine(cur) || factorOf(cur) >= factorOf(prev)) return unparseable(text);
    }

    const first = resolved[0]!;
    const target =
      canonicalUnit ??
      resolved.reduce((smallest, c) => (factorOf(units[c.unit]!.toBase) < factorOf(units[smallest]!.toBase) ? c.unit : smallest), first.unit);

    let value: number;
    if (resolved.length === 1) {
      value = first.unit === target ? first.value : convertValue(first.value, units[first.unit]!.toBase, units[target]!.toBase);
    } else {
      // The first component's sign applies to the whole: "-5 ft 6 in" is -66 in.
      const sign = first.value < 0 ? -1 : 1;
      value = sumLinear(
        resolved.map((c, i) => ({ value: i === 0 ? c.value : sign * c.value, factor: factorOf(units[c.unit]!.toBase) })),
        factorOf(units[target]!.toBase),
      );
    }
    return { ok: true, value: { value: value === 0 ? 0 : value, unit: target as C } };
  };

  const check = (value: unknown): Array<{ message: string; path?: PropertyKey[] }> => {
    if (typeof value !== 'object' || value === null) return [{ message: 'Expected { value, unit }.' }];
    const v = value as Record<string, unknown>;
    const problems: Array<{ message: string; path?: PropertyKey[] }> = [];
    if (typeof v.value !== 'number' || !Number.isFinite(v.value)) problems.push({ message: 'Expected a finite number.', path: ['value'] });
    if (typeof v.unit !== 'string' || !Object.hasOwn(units, v.unit)) {
      problems.push({ message: `Expected one of the units: ${Object.keys(units).join(', ')}.`, path: ['unit'] });
    } else if (canonicalUnit !== undefined && v.unit !== canonicalUnit) {
      problems.push({ message: `Expected the unit "${canonicalUnit}".`, path: ['unit'] });
    }
    return problems;
  };

  const defaultFormat = (value: Quantity<C>, ctx: ResolvedCtx): string => {
    const alias = units[value.unit]!.aliases[0]!;
    return `${formatNumber(value.value, ctx)}${/^['"]$/.test(alias) ? '' : ' '}${alias}`;
  };

  const codec = defineCodec<Quantity<C>>({
    id,
    kind: 'quantity',
    parse,
    format: defaultFormat,
    check,
    options: { schema, format },
  });
  return { ...codec, units: units as Readonly<Record<U, UnitDefinition>> };
}
