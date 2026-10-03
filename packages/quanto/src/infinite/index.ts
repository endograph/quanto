import { startSession } from '../core/context';
import { runUserSchema } from '../core/define-codec';
import { assertNotExternal } from '../core/define-external-codec';
import { InvalidValueError, isInvalidValueError } from '../core/errors';
import type { StandardSchemaV1 } from '../core/standard-schema';
import type { Codec, CodecOptions, Ctx, Issue, ParseContext, ParseResult } from '../core/types';
import type { Tagged } from '../merge';
import { normalize } from '../primitives/normalize';
import type { UnitDefinition } from '../quantity/codec';

/**
 * Positive or negative infinity, as plain data: `∞` is `{ infinite: 1 }`, `-∞ ft` is
 * `{ infinite: -1, unit: 'ft' }`. The unit is kept on a best-effort basis, for quantity codecs.
 */
export interface Infinite<U extends string = string> {
  readonly infinite: 1 | -1;
  readonly unit?: U | undefined;
}

type UnitOf<T> = T extends { readonly unit: infer U extends string } ? U : never;

/**
 * The value of `infinite(codec)`: the codec's values or an infinity. Over a merge, an infinity that
 * names a unit or a kind is tagged like any merged value, and a bare one isn't.
 */
export type WithInfinite<T> = [T] extends [Tagged<infer L>] ? Tagged<L | Infinite<UnitOf<L>>> | Infinite<never> : T | Infinite<UnitOf<T>>;

/** Options for `infinite`. */
export interface InfiniteOptions<T> extends CodecOptions<WithInfinite<T>> {
  /**
   * Words for infinity besides `∞`, `inf` and `infinity` (with an optional sign), which are always read.
   * `positive` replaces `infinite`, `unlimited`, `no limit` and `unbounded`; `negative` replaces
   * `negative infinity` and `minus infinity`. Each list's first word is how `format` prints that
   * infinity: `infinite(date(), { words: { positive: ['never'] } })` reads and prints `never`.
   */
  readonly words?: { readonly positive?: readonly string[] | undefined; readonly negative?: readonly string[] | undefined } | undefined;
}

/** `∞`, `inf` and `infinity`, signed or not: `-∞`, `+infinity`, `- inf`. */
const SYMBOL = /^([+-]?) ?(?:∞|(?:infinity|inf)(?!\p{L}))/iu;
const POSITIVE = ['infinite', 'unlimited', 'no limit', 'unbounded'];
const NEGATIVE = ['negative infinity', 'minus infinity'];
/** Unit aliases printed without a space after the number, as quantity formatting does. */
const ATTACHED = /^['"°%‰‱]$/;

type Units = Readonly<Record<string, UnitDefinition>>;
type Problem = { message: string; path?: PropertyKey[] };

const fold = (text: string): string => normalize(text).trim().toLowerCase();

/** A codec id as the words someone would type: `dataSize` is `data size`. Undefined for derived ids. */
const kindWords = (id: string): string | undefined => (/^[A-Za-z]+$/.test(id) ? id.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() : undefined);

const unitsOf = (codec: Codec<unknown> | undefined): Units | undefined => (codec as { units?: Units } | undefined)?.units;

const isMergedCodec = (codec: Codec<unknown>): codec is Codec<unknown> & { readonly codecs: readonly Codec<unknown>[] } =>
  Array.isArray((codec as { codecs?: unknown }).codecs);

const isTagged = (value: unknown): value is Tagged<unknown> =>
  typeof value === 'object' && value !== null && typeof (value as { codec?: unknown }).codec === 'string' && 'value' in value;

/** Whether a value is an infinity: `{ infinite: 1 }` or `{ infinite: -1 }`, with or without a unit. Over a merge, test `value.value`. */
export const isInfinite = (value: unknown): value is Infinite => {
  if (typeof value !== 'object' || value === null) return false;
  const { infinite: sign, unit } = value as { infinite?: unknown; unit?: unknown };
  return (sign === 1 || sign === -1) && (unit === undefined || typeof unit === 'string');
};

/**
 * Lets a value be infinite: `∞`, `unlimited` and `infinity` parse to `{ infinite: 1 }`, and `-∞` and
 * `negative infinity` to `{ infinite: -1 }`. A unit or a kind after the word is kept on a best-effort
 * basis, by asking the inner codec what `1 <unit>` means: `infinite feet` is `{ infinite: 1, unit: 'ft' }`,
 * and over a merge `unlimited GB` is `{ codec: 'dataSize', value: { infinite: 1, unit: 'GB' } }` and
 * `infinite length` is `{ codec: 'length', value: { infinite: 1 } }`. Other text goes to the inner codec.
 * Formats as `∞`, `-∞ ft` or `∞ length`, with the first of `words` in place of the symbol when given.
 * Wraps any codec: `infinite(dataSize())` for a quota, `infinite(date())` for an expiry that may be never.
 * The id is `infinite(<inner id>)`.
 */
export function infinite<T>(codec: Codec<T>, options?: InfiniteOptions<T>): Codec<WithInfinite<T>> {
  type V = WithInfinite<T>;
  assertNotExternal(codec, 'infinite');
  const id = `infinite(${codec.id})`;
  const userSchema = options?.schema;
  const positive = options?.words?.positive ?? POSITIVE;
  const negative = options?.words?.negative ?? NEGATIVE;
  // Longest first, so `negative infinity` wins over a shorter word it starts with.
  const words = [...negative.map((w) => [fold(w), -1] as const), ...positive.map((w) => [fold(w), 1] as const)].sort((a, b) => b[0].length - a[0].length);
  const members = isMergedCodec(codec) ? codec.codecs : undefined;
  const memberById = new Map((members ?? []).map((m) => [m.id, m]));

  /** The sign of an infinity at the start of the text, and the text after it. */
  const leading = (s: string): { sign: 1 | -1; rest: string } | undefined => {
    const symbol = SYMBOL.exec(s);
    if (symbol) return { sign: symbol[1] === '-' ? -1 : 1, rest: s.slice(symbol[0].length) };
    const lower = s.toLowerCase();
    for (const [word, sign] of words) {
      if (lower === word || lower.startsWith(`${word} `)) return { sign, rest: s.slice(word.length) };
    }
    return undefined;
  };

  /** A kind named after the infinity: the codec's own (untagged) or a merge member's (tagged). */
  const kind = (rest: string, sign: 1 | -1): V | undefined => {
    const words = rest.toLowerCase();
    if (members) {
      const member = members.find((m) => kindWords(m.id) === words);
      return member ? ({ codec: member.id, value: { infinite: sign } } as V) : undefined;
    }
    return kindWords(codec.id) === words ? ({ infinite: sign } as V) : undefined;
  };

  /**
   * A unit after the infinity, read by the inner codec as `1 <unit>`, so its aliases, case rules,
   * `canonicalUnit` and member order all apply. Its issues are reported as they are (`∞ kg` in a length
   * field is `unknown_unit`).
   */
  const unit = (rest: string, sign: 1 | -1, ctx?: Ctx): ParseResult<V> | undefined => {
    let probe = codec.parse(`1 ${rest}`, ctx);
    if (!probe.ok) {
      const attached = codec.parse(`1${rest}`, ctx);
      if (attached.ok) probe = attached;
    }
    if (!probe.ok) return { ok: false, issues: probe.issues };
    const value: unknown = probe.value;
    const read = (q: unknown): Infinite | undefined => {
      const u = (q as { unit?: unknown } | null)?.unit;
      return typeof u === 'string' ? { infinite: sign, unit: u } : undefined;
    };
    if (isTagged(value)) {
      const infinity = read(value.value);
      return infinity ? { ok: true, value: { codec: value.codec, value: infinity } as V, context: probe.context } : undefined;
    }
    const infinity = read(value);
    return infinity ? { ok: true, value: infinity as V, context: probe.context } : undefined;
  };

  const unparseable = (text: string): ParseResult<V> => ({
    ok: false,
    issues: [{ code: 'unparseable', message: `Couldn't understand "${text}" as infinity with a unit, like "∞ ft" or "unlimited GB".` }],
  });

  const validate = (value: V): { ok: true; value: V } | { ok: false; issues: readonly Issue[] } =>
    userSchema ? runUserSchema(userSchema, value, id) : { ok: true, value };

  const done = (value: V, context: ParseContext): ParseResult<V> => {
    const validated = validate(value);
    return validated.ok ? { ok: true, value: validated.value, context } : validated;
  };

  const parse = (text: string, ctx?: Ctx): ParseResult<V> => {
    const s = normalize(text).trim();
    const infinity = leading(s);
    if (infinity) {
      const rest = infinity.rest.trim();
      if (rest === '') return done({ infinite: infinity.sign } as V, startSession(ctx).context());
      const named = kind(rest, infinity.sign);
      if (named) return done(named, startSession(ctx).context());
      // A number or a sign after the infinity isn't a unit (`∞ 5 ft`, `∞ ft 6 in`, `∞ -ft`).
      if (/[\d+\-−]/.test(rest)) return unparseable(text);
      const withUnit = unit(rest, infinity.sign, ctx);
      if (!withUnit) return unparseable(text);
      return withUnit.ok ? done(withUnit.value, withUnit.context) : withUnit;
    }
    const inner = codec.parse(text, ctx);
    // The inner codec's alternatives, through the user's schema like the value.
    const wrapped = (inner.alternatives ?? []).flatMap((v): V[] => {
      const validated = validate(v as V);
      return validated.ok ? [validated.value] : [];
    });
    const alternatives = wrapped.length > 0 ? wrapped : undefined;
    if (!inner.ok) return alternatives ? { ok: false, issues: inner.issues, alternatives } : { ok: false, issues: inner.issues };
    const validated = validate(inner.value as V);
    if (!validated.ok) return alternatives ? { ...validated, alternatives } : validated;
    return alternatives ? { ok: true, value: validated.value, context: inner.context, alternatives } : { ok: true, value: validated.value, context: inner.context };
  };

  /** Problems with an infinity's unit, checked against the unit table of `owner`. */
  const unitProblems = (infinity: Infinite, owner: Codec<unknown>, path: PropertyKey[]): Problem[] => {
    if (infinity.unit === undefined) return [];
    const units = unitsOf(owner);
    if (!units) return [{ message: `Codec "${owner.id}" has no units, so its infinity can't have one.`, path: [...path, 'unit'] }];
    return units[infinity.unit] ? [] : [{ message: `"${infinity.unit}" isn't a unit of codec "${owner.id}".`, path: [...path, 'unit'] }];
  };

  /** The structural check for infinities: the value, normalized, or its problems. Undefined if it isn't one. */
  const checkInfinite = (input: unknown): { value: V } | { problems: Problem[] } | undefined => {
    const normal = (i: Infinite): Infinite => (i.unit === undefined ? { infinite: i.infinite } : { infinite: i.infinite, unit: i.unit });
    if (isInfinite(input) && !isTagged(input)) {
      const problems = unitProblems(input, codec as Codec<unknown>, []);
      return problems.length > 0 ? { problems } : { value: normal(input) as V };
    }
    if (members && isTagged(input) && isInfinite(input.value)) {
      const member = memberById.get(input.codec);
      if (!member) return { problems: [{ message: `Expected a value tagged with one of: ${[...memberById.keys()].join(', ')}.`, path: ['codec'] }] };
      const problems = unitProblems(input.value, member, ['value']);
      return problems.length > 0 ? { problems } : { value: { codec: member.id, value: normal(input.value) } as V };
    }
    return undefined;
  };

  const formatInfinite = (infinity: Infinite, owner: Codec<unknown>): string => {
    const word = infinity.infinite === 1 ? (options?.words?.positive?.[0] ?? '∞') : (options?.words?.negative?.[0] ?? '-∞');
    if (infinity.unit === undefined) return word;
    const alias = unitsOf(owner)![infinity.unit]!.aliases[0]!;
    return `${word}${ATTACHED.test(alias) ? '' : ' '}${alias}`;
  };

  const formatInner = (value: T, ctx?: Ctx): string => {
    try {
      return codec.format(value, ctx);
    } catch (error) {
      if (!isInvalidValueError(error)) throw error;
      throw new InvalidValueError(id, error.problems);
    }
  };

  const format = (value: V, ctx?: Ctx): string => {
    const checked = checkInfinite(value);
    if (checked && 'problems' in checked) throw new InvalidValueError(id, checked.problems);
    if (options?.format) {
      // The structural check still runs, so a malformed value throws the same error either way.
      if (!checked) formatInner(value as T, ctx);
      return options.format(value, startSession(ctx).ctx);
    }
    if (!checked) return formatInner(value as T, ctx);
    if (isTagged(value)) {
      const member = memberById.get(value.codec)!;
      const infinity = value.value as Infinite;
      return infinity.unit === undefined ? `${formatInfinite(infinity, member)} ${kindWords(member.id) ?? member.id}` : formatInfinite(infinity, member);
    }
    return formatInfinite(value as Infinite, codec as Codec<unknown>);
  };

  const schema: StandardSchemaV1<V, V> = {
    '~standard': {
      version: 1,
      vendor: 'quanto',
      validate(input: unknown): StandardSchemaV1.Result<V> {
        let value: V;
        const checked = checkInfinite(input);
        if (checked && 'problems' in checked) return { issues: checked.problems.map((p) => ({ ...p, code: 'invalid' }) as Issue) };
        if (checked) value = checked.value;
        else {
          const result = codec.schema['~standard'].validate(input);
          if (result instanceof Promise) throw new Error(`quanto: the schema of codec "${codec.id}" is async. quanto supports only synchronous schemas.`);
          if (result.issues) return { issues: result.issues.map((issue) => ({ ...issue, code: 'invalid' })) };
          value = result.value as V;
        }
        const validated = validate(value);
        return validated.ok ? { value: validated.value } : { issues: validated.issues };
      },
    },
  };

  return { id, parse, format, schema };
}
