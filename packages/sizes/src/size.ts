import { normalize, readNumber, type CheckProblem, type Codec, type DefaultUnit, type ParseOutcome, type Quantity, type ResolvedCtx, type UnitDefinition } from 'quanto';
import { convert, type QuantityTable } from 'quanto/quantity';

/** A size system in a size codec's unit table: a quantity unit with the system's standard step. */
export interface SizeUnitDefinition extends UnitDefinition {
  /** The step between standard sizes (0.5 for half sizes), which `nearestSize` rounds to. */
  readonly step: number;
}

/**
 * A size codec. It carries its unit table, a size system per unit, so `convert` and `compare` from
 * `quanto/quantity`, and `nearestSize`, work on its values.
 */
export interface SizeCodec<U extends string, C extends U = U> extends Codec<Quantity<C>> {
  readonly units: Readonly<Record<U, SizeUnitDefinition>>;
}

/**
 * The standard size nearest to `size` in `unit`: `size` converted, then rounded to the system's step
 * (`units[unit].step`), or to `step` when given. Conversions between systems rarely land on a size
 * (US 10.37); this is the size to look for.
 */
export function nearestSize<U extends string, T extends U>(codec: QuantityTable<U> & { readonly units: Readonly<Record<U, SizeUnitDefinition>> }, size: Quantity<U>, unit: T, options?: { readonly step?: number | undefined }): Quantity<T> {
  const step = options?.step ?? codec.units[unit].step;
  if (!(step > 0) || !Number.isFinite(step)) throw new Error(`@quantojs/sizes: nearestSize's step must be a number more than 0; got ${step}.`);
  const converted = convert(codec, size, unit).value;
  // Rounded through a decimal string, so a step of 0.1 gives 17.3 and not 17.300000000000001.
  const value = Number((Math.round(converted / step) * step).toFixed(10));
  return { value: value === 0 ? 0 : value, unit };
}

/** Words for "size" that can come before a value, in the languages that write sizes this way. */
export const SIZE_WORDS = ['size', 'sz', 'größe', 'grösse', 'gr.', 'taille', 'talla', 'taglia', 'tamanho', 'maat', 'storlek', 'størrelse'] as const;

/** Words a scan recognizes, lowercase, each with what it means to the codec. */
export type Words<K> = ReadonlyMap<string, K>;

/** Builds a word table: each word, lowercased, means `kind`. */
export function words<K>(entries: ReadonlyArray<readonly [readonly string[], K]>): Map<string, K> {
  const map = new Map<string, K>();
  for (const [list, kind] of entries) for (const word of list) map.set(normalize(word).toLowerCase(), kind);
  return map;
}

/** A value read from size text: a number, or a letter size (UK rings) in the codec's own terms. */
export interface SizeValue {
  readonly value: number;
  readonly letter: boolean;
}

/** What a size text holds: the known words before and after its value, the value, and the first unknown word. */
export interface Scan<K> {
  readonly before: readonly K[];
  readonly after: readonly K[];
  readonly value: SizeValue | undefined;
  readonly unknown: string | undefined;
}

const isLetter = (c: string | undefined): boolean => c !== undefined && /\p{L}/u.test(c);

/** The longest word of `table` at `at`, not running into a following letter. */
function matchWord<K>(lower: string, at: number, table: Words<K>): { kind: K; end: number } | undefined {
  let best: { kind: K; end: number } | undefined;
  for (const [word, kind] of table) {
    if (!lower.startsWith(word, at)) continue;
    const end = at + word.length;
    if (isLetter(word[word.length - 1]) && isLetter(lower[end])) continue;
    if (!best || end > best.end) best = { kind, end };
  }
  return best;
}

/**
 * Reads size text as words around one value: `US 7`, `7 US`, `men's US size 10½`, `17.3 mm diameter`.
 * Known words go in `before` or `after`; the first word that isn't known is `unknown`. Undefined when
 * something other than a word is left over (a second number, punctuation), which is unparseable.
 */
export function scan<K>(
  text: string,
  ctx: ResolvedCtx,
  grammar: {
    readonly before: Words<K>;
    readonly after: Words<K>;
    /** A non-numeric value at `from` (UK ring letters), tried before numbers; null if it's malformed (`N+1`). */
    readonly letter?: ((s: string, from: number) => { value: number; end: number } | null | undefined) | undefined;
  },
): Scan<K> | undefined {
  const s = normalize(text).trim();
  const lower = s.toLowerCase();
  const before: K[] = [];
  const after: K[] = [];
  let value: SizeValue | undefined;
  let unknown: string | undefined;
  let pos = 0;
  while (pos < s.length) {
    while (s[pos] === ' ') pos++;
    if (pos >= s.length) break;
    const word = matchWord(lower, pos, value ? grammar.after : grammar.before);
    if (word) {
      (value ? after : before).push(word.kind);
      pos = word.end;
      // "Size: 7"
      if (s[pos] === ':') pos++;
      continue;
    }
    if (!value) {
      const letter = grammar.letter?.(s, pos);
      if (letter === null) return undefined;
      const n = letter ?? readNumber(s, ctx, { from: pos });
      if (n) {
        value = { value: n.value, letter: letter !== undefined };
        pos = n.end;
        continue;
      }
    }
    const other = /^\p{L}[\p{L}\p{M}'.]*/u.exec(s.slice(pos));
    if (!other) return undefined;
    unknown ??= other[0];
    pos += other[0].length;
  }
  return { before, after, value, unknown };
}

/** The distinct kinds in `list` that satisfy `is`. */
export const distinct = <K, S extends K>(list: readonly K[], is: (k: K) => k is S): S[] => [...new Set(list.filter(is))];

/** The unit a bare number means under the locale's measurement system, if any. */
export const resolveDefault = <U extends string>(defaultUnit: DefaultUnit<U> | undefined, ctx: ResolvedCtx): U | undefined =>
  typeof defaultUnit === 'object' ? defaultUnit[ctx.locale.measurementSystem] : defaultUnit;

export const unparseable = (text: string, hint?: string): ParseOutcome<never> => ({
  ok: false,
  issues: [{ code: 'unparseable', message: `Couldn't understand "${text}".${hint ? ` ${hint}` : ''}` }],
});

/** A size's value in the table's base unit. */
export function baseOf(def: UnitDefinition, value: number): number {
  const { toBase } = def;
  if (typeof toBase === 'number') return value * toBase;
  if (typeof toBase === 'function') return toBase(value);
  return value * toBase.factor + toBase.offset;
}

/**
 * The structural check of a size: `{ value, unit }` with a unit in the table (the canonical unit, if
 * set), and a value that is a real size: at least `min` (0 by default) with a base value more than 0.
 */
export function checkSize(units: Readonly<Record<string, UnitDefinition>>, canonicalUnit: string | undefined, value: unknown, min: (unit: string) => number): CheckProblem[] {
  if (typeof value !== 'object' || value === null) return [{ message: 'Expected { value, unit }.' }];
  const v = value as Record<string, unknown>;
  if (typeof v.unit !== 'string' || !Object.hasOwn(units, v.unit)) return [{ message: `Expected one of the units: ${Object.keys(units).join(', ')}.`, path: ['unit'] }];
  if (canonicalUnit !== undefined && v.unit !== canonicalUnit) return [{ message: `Expected the unit "${canonicalUnit}".`, path: ['unit'] }];
  if (typeof v.value !== 'number' || !Number.isFinite(v.value)) return [{ message: 'Expected a finite number.', path: ['value'] }];
  if (v.value < min(v.unit) || !(baseOf(units[v.unit]!, v.value) > 0)) return [{ message: `${v.value} isn't a size in "${v.unit}".`, path: ['value'] }];
  return [];
}
