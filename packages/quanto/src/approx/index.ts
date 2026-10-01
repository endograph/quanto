import { startSession } from '../core/context';
import { runUserSchema } from '../core/define-codec';
import { assertNotExternal } from '../core/define-external-codec';
import { InvalidValueError, isInvalidValueError } from '../core/errors';
import type { StandardSchemaV1 } from '../core/standard-schema';
import type { Codec, CodecOptions, Ctx, Issue, ParseResult } from '../core/types';
import { normalize } from '../primitives/normalize';

/** A value that may be marked approximate: `about 5 ft` is `{ value: 5 ft, approximate: true }`. */
export interface Approx<T> {
  readonly value: T;
  readonly approximate: boolean;
}

/** Before the value: `~5 ft`, `about 5 ft`, `approx. 5 ft`. */
const PREFIX = /^(?:[~∼≈] ?|(?:about|around|approx\.?|approximately|roughly|circa|ca\.) +)/i;
/** After it: `5 ft or so`, `5 ft-ish`, `5ish`. */
const SUFFIX = /(?: +or so|(?:-| +|(?<=\d))ish)$/i;
/** On the number, before a unit: `5ish ft`, `10-ish minutes`. */
const ON_NUMBER = /(?<=\d)-?ish(?= )/i;

/** The text without its approximation markers (one before, one after, or one on the number), if it had any. */
function stripMarkers(text: string): string | undefined {
  let s = text;
  const prefix = PREFIX.exec(s);
  if (prefix) s = s.slice(prefix[0].length);
  const suffix = SUFFIX.exec(s);
  if (suffix) s = s.slice(0, suffix.index);
  else if (ON_NUMBER.test(s)) s = s.replace(ON_NUMBER, '');
  return s === text ? undefined : s.trim();
}

/**
 * Lets a value be marked approximate: `~5 ft`, `about 5 ft`, `5 ft or so`, `5-ish ft`. Text without a
 * marker parses as `approximate: false`. Formats an approximate value with `~`. Wraps any codec,
 * including a range: `approx(range(length()))` reads `about 5-7 ft`. The id is `approx(<inner id>)`.
 */
export function approx<T>(codec: Codec<T>, options?: CodecOptions<Approx<T>>): Codec<Approx<T>> {
  assertNotExternal(codec, 'approx');
  const id = `approx(${codec.id})`;
  const userSchema = options?.schema;

  const parse = (text: string, ctx?: Ctx): ParseResult<Approx<T>> => {
    const stripped = stripMarkers(normalize(text).trim());
    if (stripped === '') return { ok: false, issues: [{ code: 'unparseable', message: `Add a value, like "about 5".` }] };
    const inner = codec.parse(stripped ?? text, ctx);
    if (!inner.ok) return inner;
    const approximate = stripped !== undefined;
    let value: Approx<T> = { value: inner.value, approximate };
    if (userSchema) {
      const validated = runUserSchema(userSchema, value, id);
      if (!validated.ok) return validated;
      value = validated.value;
    }
    const alternatives = inner.alternatives?.map((v) => ({ value: v, approximate }));
    return alternatives ? { ok: true, value, context: inner.context, alternatives } : { ok: true, value, context: inner.context };
  };

  const isApprox = (value: unknown): value is Approx<T> =>
    typeof value === 'object' && value !== null && 'value' in value && typeof (value as { approximate?: unknown }).approximate === 'boolean';

  const format = (value: Approx<T>, ctx?: Ctx): string => {
    if (!isApprox(value)) throw new InvalidValueError(id, [{ message: 'Expected { value, approximate }.' }]);
    let inner: string;
    try {
      inner = codec.format(value.value, ctx);
    } catch (error) {
      if (!isInvalidValueError(error)) throw error;
      throw new InvalidValueError(id, error.problems.map((p) => ({ message: p.message, path: ['value', ...(p.path ?? [])] })));
    }
    if (options?.format) return options.format(value, startSession(ctx).ctx);
    return value.approximate ? `~${inner}` : inner;
  };

  const schema: StandardSchemaV1<Approx<T>, Approx<T>> = {
    '~standard': {
      version: 1,
      vendor: 'quanto',
      validate(input: unknown): StandardSchemaV1.Result<Approx<T>> {
        if (!isApprox(input)) return { issues: [{ message: 'Expected { value, approximate }.', code: 'invalid' } as Issue] };
        const result = codec.schema['~standard'].validate(input.value);
        if (result instanceof Promise) throw new Error(`quanto: the schema of codec "${codec.id}" is async. quanto supports only synchronous schemas.`);
        if (result.issues) return { issues: result.issues.map((issue) => ({ ...issue, path: ['value', ...(issue.path ?? [])], code: 'invalid' })) };
        const value: Approx<T> = { value: result.value, approximate: input.approximate };
        if (!userSchema) return { value };
        const validated = runUserSchema(userSchema, value, id);
        return validated.ok ? { value: validated.value } : { issues: validated.issues };
      },
    },
  };

  return { id, parse, format, schema };
}
