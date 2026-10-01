import { mergeContexts, startSession } from '../core/context';
import { runUserSchema } from '../core/define-codec';
import { InvalidValueError } from '../core/errors';
import type { StandardSchemaV1 } from '../core/standard-schema';
import type { Codec, CodecOptions, Ctx, Issue, ParseResult, ResolvedCtx } from '../core/types';
import { normalize } from '../primitives/normalize';

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

/** A proposed completion of a range's two sides. */
export interface RangeProposal<T> {
  readonly sides: readonly [string, string];
  /**
   * If the sides parse out of order, try this end instead: `Oct 3 10pm-1am` moves the end to the next
   * day. Return undefined when there's nothing to try.
   */
  readonly adjustEnd?: ((end: T) => T | undefined) | undefined;
}

/** How a range of one kind of value is completed and ordered. Every part is optional. */
export interface RangeRules<T> {
  /**
   * Textual completions of the two sides, most preferred first: a side borrows what it's missing from
   * the other (`5-7 ft` → `5 ft`, `7 ft`). The sides as typed are always tried after these.
   */
  propose?(left: string, right: string, ctx: ResolvedCtx): readonly RangeProposal<T>[];
  /** Whether `start <= end`; undefined when it can't be told. Only used to choose between completions. */
  inOrder?(start: T, end: T): boolean | undefined;
}

/**
 * Builds a range codec over any codec: `defineRange` does the splitting (`-`, `–`, `—`, `to`, `until`,
 * `through`), tries each split and completion, prefers the first in order, runs the user's schema and
 * formats `start – end`. `rules` say how sides complete and how values order. With no rules, both sides
 * must be written in full. The id is `range(<inner id>)`.
 */
export function defineRange<T>(codec: Codec<T>, rules?: RangeRules<T>, options?: CodecOptions<Range<T>>): Codec<Range<T>> {
  const id = `range(${codec.id})`;
  const userSchema = options?.schema;
  const inOrder = (start: T, end: T): boolean => rules?.inOrder?.(start, end) ?? true;
  const proposals = (left: string, right: string, ctx: ResolvedCtx): readonly RangeProposal<T>[] => {
    const proposed = rules?.propose?.(left, right, ctx) ?? [];
    const typed = proposed.some((p) => p.sides[0] === left && p.sides[1] === right && !p.adjustEnd);
    return typed ? proposed : [...proposed, { sides: [left, right] }];
  };

  const parse = (text: string, ctx?: Ctx): ParseResult<Range<T>> => {
    if (text.trim() === '') return { ok: false, issues: [{ code: 'empty', message: 'Enter a value.' }] };
    const session = startSession(ctx);
    const candidates = splits(normalize(text).trim());
    if (candidates.length === 0) {
      return { ok: false, issues: [{ code: 'unparseable', message: `Enter a range, like "5-7" or "5 to 7".` }] };
    }

    // Every parse in one range sees the same clock: once a parse reads it, later parses get that
    // reading as ctx.now, so both sides (and every completion) use one "now".
    let pinned: Ctx | undefined = ctx;
    const pin = (result: ParseResult<T>): void => {
      if (pinned?.now === undefined && result.ok && result.context.now !== undefined) pinned = { ...ctx, now: result.context.now };
    };
    let firstIssues: readonly Issue[] | undefined;
    for (const [left, right] of candidates) {
      // Parse every proposal, then prefer: in order as parsed; in order after adjusting the end
      // (Dec 30 - Jan 2, Oct 3 10pm-1am); and finally the first that parsed at all.
      const parsed: Array<{ a: ParseResult<T> & { ok: true }; b: ParseResult<T> & { ok: true }; adjustEnd: RangeProposal<T>['adjustEnd'] }> = [];
      for (const { sides: [l, r], adjustEnd } of proposals(left, right, session.ctx)) {
        const a = codec.parse(l, pinned);
        pin(a);
        if (!a.ok) {
          firstIssues ??= a.issues;
          continue;
        }
        const b = codec.parse(r, pinned);
        pin(b);
        if (!b.ok) {
          firstIssues ??= b.issues;
          continue;
        }
        parsed.push({ a, b, adjustEnd });
      }
      if (parsed.length === 0) continue;

      let chosen: { start: T; end: T; a: ParseResult<T> & { ok: true }; b: ParseResult<T> & { ok: true } } | undefined;
      const inOrderAsParsed = parsed.find((p) => inOrder(p.a.value, p.b.value));
      if (inOrderAsParsed) chosen = { start: inOrderAsParsed.a.value, end: inOrderAsParsed.b.value, a: inOrderAsParsed.a, b: inOrderAsParsed.b };
      for (const p of chosen ? [] : parsed) {
        const adjusted = p.adjustEnd?.(p.b.value);
        if (adjusted === undefined || !inOrder(p.a.value, adjusted)) continue;
        const validated = codec.schema['~standard'].validate(adjusted);
        if (validated instanceof Promise || validated.issues) continue;
        chosen = { start: p.a.value, end: validated.value as T, a: p.a, b: p.b };
        break;
      }
      const first = parsed[0]!;
      chosen ??= { start: first.a.value, end: first.b.value, a: first.a, b: first.b };

      let value: Range<T> = { start: chosen.start, end: chosen.end };
      if (userSchema) {
        const validated = runUserSchema(userSchema, value, id);
        if (!validated.ok) return validated;
        value = validated.value;
      }
      return { ok: true, value, context: mergeContexts([chosen.a.context, chosen.b.context]) };
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
