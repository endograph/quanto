import { mergeContexts, startSession } from '../core/context';
import { runUserSchema } from '../core/define-codec';
import { InvalidValueError } from '../core/errors';
import type { StandardSchemaV1 } from '../core/standard-schema';
import type { Codec, CodecOptions, Ctx, Issue, ParseResult } from '../core/types';
import { normalize } from '../primitives/normalize';
import type { UnitDefinition } from '../codecs/quantity';
import { factorOf, offsetOf } from '../codecs/quantity/convert';
import { strategyFor } from './strategies';

/** A range value: two values of the inner codec. */
export interface Range<T> {
  readonly start: T;
  readonly end: T;
}

const SEPARATOR = /–|—|-|\s(?:to|until|through)\s/gi;

/** Every way to split the text at a separator, left to right, with both sides non-empty. */
function splits(text: string): Array<readonly [string, string]> {
  const out: Array<readonly [string, string]> = [];
  for (const match of text.matchAll(SEPARATOR)) {
    const left = text.slice(0, match.index).trim();
    const right = text.slice(match.index + match[0].length).trim();
    if (left && right) out.push([left, right]);
  }
  return out;
}

/**
 * Whether `start <= end`, where the kind of value makes that knowable: quantities of a codec with a
 * unit table, and money in one currency. Anything else counts as in order.
 */
function inOrder(codec: Codec<unknown>, start: unknown, end: unknown): boolean {
  if (codec.kind === 'quantity' && 'units' in codec) {
    const units = (codec as { units: Readonly<Record<string, UnitDefinition>> }).units;
    const base = (q: unknown): number | undefined => {
      const { value, unit } = q as { value?: unknown; unit?: unknown };
      const def = typeof unit === 'string' && Object.hasOwn(units, unit) ? units[unit] : undefined;
      return def && typeof value === 'number' ? value * factorOf(def.toBase) + offsetOf(def.toBase) : undefined;
    };
    const a = base(start);
    const b = base(end);
    // Same tolerance as compare() in quanto/quantity: equal within drift counts as in order.
    if (a !== undefined && b !== undefined) return a <= b + 1e-9 * Math.max(Math.abs(a), Math.abs(b));
  }
  if (codec.kind === 'money') {
    const a = start as { minorUnits?: unknown; currency?: unknown };
    const b = end as { minorUnits?: unknown; currency?: unknown };
    if (a.currency === b.currency && typeof a.minorUnits === 'number' && typeof b.minorUnits === 'number') return a.minorUnits <= b.minorUnits;
  }
  return true;
}

/**
 * A range of any codec's values: `5-7 ft`, `$10-20k`, `150 to 180 cm`. A side borrows what it's
 * missing from the other (see DESIGN.md, Ranges). The id is `range(<inner id>)`; there is no `kind`.
 */
export function range<T>(codec: Codec<T>, options?: CodecOptions<Range<T>>): Codec<Range<T>> {
  const id = `range(${codec.id})`;
  const strategy = strategyFor(codec.kind);
  const userSchema = options?.schema;

  const parse = (text: string, ctx?: Ctx): ParseResult<Range<T>> => {
    if (text.trim() === '') return { ok: false, issues: [{ code: 'empty', message: 'Enter a value.' }] };
    const session = startSession(ctx);
    const candidates = splits(normalize(text).trim());
    if (candidates.length === 0) {
      return { ok: false, issues: [{ code: 'unparseable', message: `Enter a range, like "5-7" or "5 to 7".` }] };
    }

    let firstIssues: readonly Issue[] | undefined;
    for (const [left, right] of candidates) {
      let fallback: { start: T; end: T; contexts: [ParseResult<T>, ParseResult<T>] } | undefined;
      for (const [l, r] of strategy(left, right, session.ctx)) {
        const a = codec.parse(l, ctx);
        if (!a.ok) {
          firstIssues ??= a.issues;
          continue;
        }
        const b = codec.parse(r, ctx);
        if (!b.ok) {
          firstIssues ??= b.issues;
          continue;
        }
        if (inOrder(codec as Codec<unknown>, a.value, b.value)) {
          fallback = { start: a.value, end: b.value, contexts: [a, b] };
          break;
        }
        fallback ??= { start: a.value, end: b.value, contexts: [a, b] };
      }
      if (!fallback) continue;

      let value: Range<T> = { start: fallback.start, end: fallback.end };
      if (userSchema) {
        const validated = runUserSchema(userSchema, value, id);
        if (!validated.ok) return validated;
        value = validated.value;
      }
      const contexts = fallback.contexts.flatMap((r) => (r.ok ? [r.context] : []));
      return { ok: true, value, context: mergeContexts(contexts) };
    }
    return { ok: false, issues: firstIssues ?? [{ code: 'unparseable', message: `Couldn't understand "${text}" as a range.` }] };
  };

  const isRange = (value: unknown): value is Range<T> =>
    typeof value === 'object' && value !== null && 'start' in value && 'end' in value;

  const format = (value: Range<T>, ctx?: Ctx): string => {
    if (!isRange(value)) throw new InvalidValueError(id, [{ message: 'Expected { start, end }.' }]);
    if (options?.format) {
      innerSchemaCheck(value);
      return options.format(value, startSession(ctx).ctx);
    }
    return `${codec.format(value.start, ctx)} – ${codec.format(value.end, ctx)}`;
  };

  const validateSide = (value: unknown, side: 'start' | 'end'): readonly StandardSchemaV1.Issue[] => {
    const result = codec.schema['~standard'].validate(value);
    if (result instanceof Promise) throw new Error(`quanto: the schema of codec "${codec.id}" is async, which quanto v1 doesn't support.`);
    return (result.issues ?? []).map((issue) => ({ ...issue, path: [side, ...(issue.path ?? [])] }));
  };

  const innerSchemaCheck = (value: Range<T>): void => {
    const problems = [...validateSide(value.start, 'start'), ...validateSide(value.end, 'end')];
    if (problems.length > 0) {
      throw new InvalidValueError(
        id,
        problems.map((p) => ({ message: p.message, path: p.path?.map((s) => (typeof s === 'object' ? s.key : s)) })),
      );
    }
  };

  const schema: StandardSchemaV1<Range<T>, Range<T>> = {
    '~standard': {
      version: 1,
      vendor: 'quanto',
      validate(value: unknown): StandardSchemaV1.Result<Range<T>> {
        if (!isRange(value)) return { issues: [{ message: 'Expected { start, end }.', code: 'invalid' } as Issue] };
        const issues = [...validateSide(value.start, 'start'), ...validateSide(value.end, 'end')];
        if (issues.length > 0) return { issues: issues.map((i) => ({ ...i, code: 'invalid' })) };
        if (!userSchema) return { value };
        const validated = runUserSchema(userSchema, value, id);
        return validated.ok ? { value: validated.value } : { issues: validated.issues };
      },
    },
  };

  return { id, parse, format, schema };
}
