import { mergeContexts, startSession } from '../core/context';
import { runUserSchema } from '../core/define-codec';
import { assertNotExternal } from '../core/define-external-codec';
import { InvalidValueError, isInvalidValueError } from '../core/errors';
import type { StandardSchemaV1 } from '../core/standard-schema';
import type { Codec, CodecOptions, Ctx, Issue, ParseContext, ParseResult, ResolvedCtx } from '../core/types';
import type { NumberSyntax, UnitDefinition } from '../quantity/codec';
import { normalize } from '../primitives/normalize';
import { readNumber } from '../primitives/number';
import { numberSpan } from '../range';

/** How many parts a value has: exactly `n`, or between `min` and `max` (inclusive; either may be left out). */
export type DimensionCount = number | { readonly min?: number | undefined; readonly max?: number | undefined };

export interface DimensionsOptions<T> extends CodecOptions<T[]> {
  /** How many parts: `2` for `24 × 36 in`, `3` for a box, `{ min: 2 }` for two or more. */
  readonly count: DimensionCount;
}

/**
 * Between parts: `×`, `*`, `by`, and `x` after something and before a number (`24x36`, `24in x 36in`),
 * so a unit with an `x` in it (`lx`) isn't split. Not before `10^`, where `×` is scientific notation.
 */
const SEPARATOR = /\s*(?:(?:[×*]|(?<=\S)\s*x(?=\s*[\d.+-]))(?!\s*10\^)|(?<!\p{L})by(?!\p{L}))\s*/giu;

/** A magnitude after a part's number (`1.5k x 2k ft`), as the quantity codecs read it. */
const MAGNITUDE = /^(?:bn|k|m| ?thousand| ?million| ?billion)(?![\p{L}\p{N}])/iu;

const DEFAULT_READ: NumberSyntax['read'] = (text, ctx, from) => readNumber(text, ctx, { from });

function assertCount(id: string, count: DimensionCount): { min: number; max: number } {
  const [min, max] = typeof count === 'number' ? [count, count] : [count.min ?? 1, count.max ?? Infinity];
  const whole = (n: number) => Number.isInteger(n) && n >= 1;
  if (!whole(min) || !(max === Infinity || whole(max)) || min > max) {
    throw new Error(`quanto: count of "${id}" must be a whole number of at least 1, or { min, max } with min <= max. Got ${JSON.stringify(count)}.`);
  }
  return { min, max };
}

const describeCount = ({ min, max }: { min: number; max: number }): string =>
  min === max ? `${min}` : max === Infinity ? `at least ${min}` : `${min} to ${max}`;

/**
 * A fixed or bounded number of values written together: `24 × 36 in`, `2 m × 50 cm`, `1920x1080`,
 * `24 x 36 x 10 cm`. Wraps any codec; the value is an array of the inner codec's values. A unit after the
 * last part applies to the bare numbers before it, and a part may carry its own unit. Parts are separated
 * by `×`, `x`, `*` or `by`. Formats with ` × `, writing a shared unit once (`24 × 36 in`). The id is
 * `dimensions(<inner id>)`.
 */
export function dimensions<T>(codec: Codec<T>, options: DimensionsOptions<T>): Codec<T[]> {
  assertNotExternal(codec, 'dimensions');
  const id = `dimensions(${codec.id})`;
  const count = assertCount(id, options.count);
  const userSchema = options.schema;
  const read = (codec as { readonly number?: NumberSyntax }).number?.read ?? DEFAULT_READ;
  const units = (codec as { readonly units?: Readonly<Record<string, UnitDefinition>> }).units;

  const wrongCount = (n: number): Issue => ({
    code: 'wrong_count',
    message: `Enter ${describeCount(count)} dimension${count.max === 1 ? '' : 's'}, like "24 × 36". This has ${n}.`,
  });

  /** A part's number, any magnitude on it, and what follows: the unit text a bare part can borrow. */
  const analyze = (part: string, ctx: ResolvedCtx): { bare: boolean; magnitude: string; tail: string } | undefined => {
    const span = numberSpan(part, ctx, read);
    if (!span || part.slice(0, span.start).trim() !== '') return undefined;
    const rest = part.slice(span.end);
    const magnitude = MAGNITUDE.exec(rest)?.[0] ?? '';
    const tail = rest.slice(magnitude.length).trim();
    return { bare: tail === '', magnitude, tail };
  };

  const parse = (text: string, ctx?: Ctx): ParseResult<T[]> => {
    if (text.trim() === '') return { ok: false, issues: [{ code: 'empty', message: 'Enter a value.' }] };
    const resolved = startSession(ctx).ctx;
    const parts = normalize(text).trim().split(SEPARATOR);
    if (parts.some((p) => p.trim() === '')) {
      return { ok: false, issues: [{ code: 'unparseable', message: `Couldn't understand "${text}" as dimensions, like "24 × 36 in".` }] };
    }
    // A unit written after the last part is shared by the bare numbers before it: "24 × 36 in".
    const shared = parts.length > 1 ? analyze(parts[parts.length - 1]!, resolved)?.tail : undefined;
    const values: T[] = [];
    const contexts: ParseContext[] = [];
    // The last part first: its issue explains the others' ("24 × in" is about "in", not a missing unit on 24).
    const order = [parts.length - 1, ...parts.keys()].slice(0, parts.length);
    for (const i of order) {
      const part = parts[i]!;
      const shape = shared && i < parts.length - 1 ? analyze(part, resolved) : undefined;
      const result = codec.parse(shape?.bare ? `${part} ${shared}` : part, ctx);
      if (!result.ok) return { ok: false, issues: result.issues.map((issue) => ({ ...issue, path: [i, ...(issue.path ?? [])] })) };
      values[i] = result.value;
      contexts.push(result.context);
    }
    const context = mergeContexts(contexts);
    if (values.length < count.min || values.length > count.max) return { ok: false, issues: [wrongCount(values.length)] };
    if (!userSchema) return { ok: true, value: values, context };
    const validated = runUserSchema(userSchema, values, id);
    return validated.ok ? { ok: true, value: validated.value, context } : validated;
  };

  const shapeProblem = (value: unknown): string | undefined =>
    !Array.isArray(value)
      ? 'Expected an array.'
      : value.length < count.min || value.length > count.max
        ? `Expected ${describeCount(count)} values, not ${value.length}.`
        : undefined;

  const format = (value: T[], ctx?: Ctx): string => {
    const problem = shapeProblem(value);
    if (problem) throw new InvalidValueError(id, [{ message: problem }]);
    const texts = value.map((v, i) => {
      try {
        return codec.format(v, ctx);
      } catch (error) {
        if (!isInvalidValueError(error)) throw error;
        throw new InvalidValueError(id, error.problems.map((p) => ({ message: p.message, path: [i, ...(p.path ?? [])] })));
      }
    });
    if (options.format) return options.format(value, startSession(ctx).ctx);
    // A unit shared by every part is written once, after the last: "24 × 36 in", which reads back the same.
    const unit = (value[0] as { unit?: unknown } | undefined)?.unit;
    const alias = typeof unit === 'string' && units && Object.hasOwn(units, unit) ? ` ${units[unit]!.aliases[0]}` : undefined;
    const sharesUnit = alias !== undefined && value.every((v) => (v as { unit?: unknown }).unit === unit) && texts.every((t) => t.endsWith(alias));
    return (sharesUnit ? texts.map((t, i) => (i < texts.length - 1 ? t.slice(0, -alias.length) : t)) : texts).join(' × ');
  };

  const schema: StandardSchemaV1<T[], T[]> = {
    '~standard': {
      version: 1,
      vendor: 'quanto',
      validate(input: unknown): StandardSchemaV1.Result<T[]> {
        const problem = shapeProblem(input);
        if (problem) return { issues: [{ message: problem, code: 'invalid' } as Issue] };
        const values: T[] = [];
        const issues: StandardSchemaV1.Issue[] = [];
        for (const [i, v] of (input as unknown[]).entries()) {
          const result = codec.schema['~standard'].validate(v);
          if (result instanceof Promise) throw new Error(`quanto: the schema of codec "${codec.id}" is async. quanto supports only synchronous schemas.`);
          if (result.issues) issues.push(...result.issues.map((issue) => ({ ...issue, path: [i, ...(issue.path ?? [])], code: 'invalid' })));
          else values.push(result.value);
        }
        if (issues.length > 0) return { issues };
        if (!userSchema) return { value: values };
        const validated = runUserSchema(userSchema, values, id);
        return validated.ok ? { value: validated.value } : { issues: validated.issues };
      },
    },
  };

  return { id, parse, format, schema };
}
