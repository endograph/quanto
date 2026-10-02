import { mergeContexts, startSession } from '../core/context';
import { runUserSchema } from '../core/define-codec';
import { assertNotExternal } from '../core/define-external-codec';
import { InvalidValueError, isInvalidValueError } from '../core/errors';
import type { StandardSchemaV1 } from '../core/standard-schema';
import type { Codec, CodecOptions, Ctx, Issue, ParseContext, ParseResult, ResolvedCtx } from '../core/types';
import { normalize } from '../primitives/normalize';
import { numberWordSpans, type LocaleCtx } from '../primitives/number';

/** A range value: two values of the inner codec. */
export interface Range<T> {
  readonly start: T;
  readonly end: T;
}

/**
 * A range that may be open at one end: `5+ ft` is `{ start: 5 ft, end: null }`, `under 7 ft` is
 * `{ start: null, end: 7 ft, endExclusive: true }`. An exclusive flag is set only on the bound of an
 * open range, and only when the bound itself is excluded (`>`, `under`, `before`).
 */
export interface OpenRange<T> {
  readonly start: T | null;
  readonly end: T | null;
  readonly startExclusive?: true;
  readonly endExclusive?: true;
}

/** Options for a range codec. `open: true` also accepts ranges open at one end, as `OpenRange<T>`. */
export interface RangeOptions<V> extends CodecOptions<V> {
  readonly open?: boolean | undefined;
}

const SEPARATOR = /–|—|-|\s(?:to|until|through)\s/gi;
const BETWEEN_SEPARATOR = /–|—|-|\s(?:to|until|through|and)\s/gi;

type Bound = { readonly side: 'start' | 'end'; readonly exclusive: boolean };

/** Words and symbols that make one bound, before the value (`at least 5 ft`) or after it (`5 ft or more`). */
const BOUND_PREFIXES: ReadonlyArray<readonly [RegExp, Bound]> = [
  [/^(?:>=|≥|at least\s|min\.?\s|minimum\s|from\s|since\s|no less than\s)/i, { side: 'start', exclusive: false }],
  [/^(?:>|over\s|above\s|more than\s|greater than\s|after\s)/i, { side: 'start', exclusive: true }],
  [/^(?:<=|≤|up to\s|at most\s|max\.?\s|maximum\s|until\s|till\s|by\s|no more than\s)/i, { side: 'end', exclusive: false }],
  [/^(?:<|under\s|below\s|less than\s|fewer than\s|before\s)/i, { side: 'end', exclusive: true }],
];
const BOUND_SUFFIXES: ReadonlyArray<readonly [RegExp, Bound]> = [
  [/\s(?:or more|or above|or over|or greater|or later|and up|and above|and over|onwards)$/i, { side: 'start', exclusive: false }],
  [/\s(?:or less|or fewer|or under|or below|or earlier|and under|and below)$/i, { side: 'end', exclusive: false }],
];

/**
 * The bound and the value's text, if the text is one bound. A `+` after the number or at the end is a
 * lower bound: `5+ ft`, `5 ft+`, `$500+`; a leading `+` is a sign.
 */
function readBound(text: string): { bound: Bound; side: string } | undefined {
  for (const [pattern, bound] of BOUND_PREFIXES) {
    const m = pattern.exec(text);
    if (m) return { bound, side: text.slice(m[0].length).trim() };
  }
  for (const [pattern, bound] of BOUND_SUFFIXES) {
    const m = pattern.exec(text);
    if (m) return { bound, side: text.slice(0, m.index).trim() };
  }
  const lower: Bound = { side: 'start', exclusive: false };
  if (text.length > 1 && text.endsWith('+')) return { bound: lower, side: text.slice(0, -1).trim() };
  const plus = /(\d[\p{L}]*)\+(?=\s)/u.exec(text);
  if (plus) return { bound: lower, side: text.slice(0, plus.index + plus[1]!.length) + text.slice(plus.index + plus[0].length) };
  return undefined;
}

/**
 * Every way to split the text at a separator, left to right, with both sides non-empty. `between 5
 * and 7` and `from 5 to 7` drop the leading word, and `between` makes `and` a separator. A separator
 * inside a number in words isn't one: `twenty-five`, `one hundred and five`.
 */
function splits(text: string, ctx: LocaleCtx): Array<readonly [string, string]> {
  const between = /^between\s/i.exec(text);
  if (between || /^from\s/i.test(text)) text = text.replace(/^\S+\s+/, '');
  const words = numberWordSpans(text, ctx);
  const out: Array<readonly [string, string]> = [];
  for (const match of text.matchAll(between ? BETWEEN_SEPARATOR : SEPARATOR)) {
    if (words.some(([start, end]) => match.index > start && match.index < end)) continue;
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
   * the other (`5-7 ft` → `5 ft`, `7 ft`). The sides as typed are always tried after these. Completion
   * is textual, so `ctx.now()` throws here: leave relative words (`tomorrow`) for the sides' parse,
   * which reads the clock once for both sides and reports it in the result's `context`.
   */
  propose?(left: string, right: string, ctx: ResolvedCtx): readonly RangeProposal<T>[];
  /** Whether `start <= end`; undefined when it can't be told. Only used to choose between completions. */
  inOrder?(start: T, end: T): boolean | undefined;
  /**
   * Why two values can't be the ends of one range, or undefined if they can: quantities on different
   * scales (`80 dB-90 dBA`). Such a pair is rejected when parsed, and fails the structural check.
   */
  incompatible?(start: T, end: T): Issue | undefined;
  /**
   * A shorter text for a range with both sides, sharing what they have in common (`Oct 3–5, 2026`), or
   * undefined for the default `start – end`. It must read back through `propose` to the same range.
   */
  format?(start: T, end: T, ctx: ResolvedCtx): string | undefined;
}

/**
 * Builds a range codec over any codec: `defineRange` does the splitting (`-`, `–`, `—`, `to`, `until`,
 * `through`, `between … and`), tries each split and completion, prefers the first in order, runs the
 * user's schema and formats `start – end`. `rules` say how sides complete, how values order and,
 * optionally, a shorter format. With no rules, both sides must be written in full. The id is
 * `range(<inner id>)`.
 *
 * With `open: true` it also reads one bound (`5+ ft`, `at least 5 ft`, `under 7 ft`, `≤ 7 ft`), as an
 * `OpenRange<T>`, and formats it with `≥`, `>`, `≤` or `<`.
 */
export function defineRange<T>(codec: Codec<T>, rules: RangeRules<T> | undefined, options: RangeOptions<OpenRange<T>> & { readonly open: true }): Codec<OpenRange<T>>;
export function defineRange<T>(codec: Codec<T>, rules?: RangeRules<T>, options?: RangeOptions<Range<T>> & { readonly open?: false | undefined }): Codec<Range<T>>;
export function defineRange<T>(codec: Codec<T>, rules?: RangeRules<T>, options?: RangeOptions<OpenRange<T>> | RangeOptions<Range<T>>): Codec<OpenRange<T>> | Codec<Range<T>> {
  assertNotExternal(codec, 'range');
  const id = `range(${codec.id})`;
  const open = options?.open === true;
  // A closed range is an open range with both sides set, so one implementation handles both shapes.
  const userSchema = options?.schema as StandardSchemaV1<OpenRange<T>, OpenRange<T>> | undefined;
  const userFormat = options?.format as ((value: OpenRange<T>, ctx: ResolvedCtx) => string) | undefined;
  const inOrder = (start: T, end: T): boolean => rules?.inOrder?.(start, end) ?? true;
  const proposals = (left: string, right: string, ctx: ResolvedCtx): readonly RangeProposal<T>[] => {
    const proposed = rules?.propose?.(left, right, ctx) ?? [];
    const typed = proposed.some((p) => p.sides[0] === left && p.sides[1] === right && !p.adjustEnd);
    return typed ? proposed : [...proposed, { sides: [left, right] }];
  };

  /** Runs the user's schema on a parsed range and returns the result. */
  const finish = (value: OpenRange<T>, context: ParseContext): ParseResult<OpenRange<T>> => {
    if (!userSchema) return { ok: true, value, context };
    const validated = runUserSchema(userSchema, value, id);
    return validated.ok ? { ok: true, value: validated.value, context } : validated;
  };

  const parse = (text: string, ctx?: Ctx): ParseResult<OpenRange<T>> => {
    if (text.trim() === '') return { ok: false, issues: [{ code: 'empty', message: 'Enter a value.' }] };
    // Completion gets the locale but not the clock, so every clock reading comes from the sides' parses.
    const resolved = startSession(ctx).ctx;
    const completionCtx: ResolvedCtx = {
      locale: resolved.locale,
      grammars: resolved.grammars,
      now: () => {
        throw new Error(`quanto: range completion for codec "${id}" read the clock. Completion is textual: leave relative words for the sides' parse.`);
      },
    };
    const normalized = normalize(text).trim();
    const candidates = splits(normalized, resolved);
    const bound = open ? readBound(normalized) : undefined;
    if (candidates.length === 0 && !bound) {
      return { ok: false, issues: [{ code: 'unparseable', message: open ? `Enter a range, like "5-7", "5+" or "under 7".` : `Enter a range, like "5-7" or "5 to 7".` }] };
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
      for (const { sides: [l, r], adjustEnd } of proposals(left, right, completionCtx)) {
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
        const conflict = rules?.incompatible?.(a.value, b.value);
        if (conflict) {
          firstIssues ??= [conflict];
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

      return finish({ start: chosen.start, end: chosen.end }, mergeContexts([chosen.a.context, chosen.b.context]));
    }
    if (bound) {
      // One bound: its issues are the ones to report, since the text was written as one.
      if (bound.side === '') return { ok: false, issues: [{ code: 'unparseable', message: `Add a value, like "${normalized} 5".` }] };
      const side = codec.parse(bound.side, ctx);
      // A side's alternatives aren't a range's: the range would need one per reading of the other side.
      if (!side.ok) return { ok: false, issues: side.issues };
      const exclusive = bound.bound.exclusive;
      const value: OpenRange<T> = bound.bound.side === 'start'
        ? { start: side.value, end: null, ...(exclusive ? { startExclusive: true } : {}) }
        : { start: null, end: side.value, ...(exclusive ? { endExclusive: true } : {}) };
      return finish(value, side.context);
    }
    return { ok: false, issues: firstIssues ?? [{ code: 'unparseable', message: `Couldn't understand "${text}" as a range.` }] };
  };

  /**
   * The shape of a range: both sides, or with `open`, one side null and an exclusive flag (`true`) on
   * the other at most. Returns a problem, or undefined.
   */
  const shapeProblem = (value: unknown): string | undefined => {
    const expected = open ? 'Expected { start, end }, with at most one of them null.' : 'Expected { start, end }.';
    if (typeof value !== 'object' || value === null || !('start' in value) || !('end' in value)) return expected;
    const v = value as Record<string, unknown>;
    const nulls = (v.start === null ? 1 : 0) + (v.end === null ? 1 : 0);
    if (nulls > (open ? 1 : 0)) return expected;
    for (const [flag, side, other] of [['startExclusive', 'start', 'end'], ['endExclusive', 'end', 'start']] as const) {
      if (v[flag] === undefined) continue;
      if (!open || v[flag] !== true || v[side] === null || v[other] !== null) return `"${flag}" is only allowed, as true, on the bound of a range open at the other end.`;
    }
    return undefined;
  };

  /** Formats one side with the inner codec, so a malformed side throws with its path prefixed. */
  const formatSide = (value: T, side: 'start' | 'end', ctx: Ctx | undefined): string => {
    try {
      return codec.format(value, ctx);
    } catch (error) {
      if (!isInvalidValueError(error)) throw error;
      throw new InvalidValueError(id, error.problems.map((p) => ({ message: p.message, path: [side, ...(p.path ?? [])] })));
    }
  };

  // Like every codec's format, this checks structure only, never the user's schema, so a stored range
  // a later, stricter schema rejects still displays (DESIGN.md).
  const format = (value: OpenRange<T>, ctx?: Ctx): string => {
    const problem = shapeProblem(value);
    if (problem) throw new InvalidValueError(id, [{ message: problem }]);
    const start = value.start === null ? undefined : formatSide(value.start, 'start', ctx);
    const end = value.end === null ? undefined : formatSide(value.end, 'end', ctx);
    const conflict = value.start !== null && value.end !== null ? rules?.incompatible?.(value.start, value.end) : undefined;
    if (conflict) throw new InvalidValueError(id, [{ message: conflict.message }]);
    if (userFormat) return userFormat(value, startSession(ctx).ctx);
    if (start === undefined) return `${value.endExclusive ? '<' : '≤'} ${end}`;
    if (end === undefined) return `${value.startExclusive ? '>' : '≥'} ${start}`;
    return rules?.format?.(value.start as T, value.end as T, startSession(ctx).ctx) ?? `${start} – ${end}`;
  };

  /** Validates one side with the inner schema: its output, or its issues with the side prefixed to their paths. */
  const validateSide = (value: unknown, side: 'start' | 'end'): StandardSchemaV1.Result<T> => {
    const result = codec.schema['~standard'].validate(value);
    if (result instanceof Promise) throw new Error(`quanto: the schema of codec "${codec.id}" is async. quanto supports only synchronous schemas.`);
    if (!result.issues) return result;
    return { issues: result.issues.map((issue) => ({ ...issue, path: [side, ...(issue.path ?? [])] })) };
  };

  const schema: StandardSchemaV1<OpenRange<T>, OpenRange<T>> = {
    '~standard': {
      version: 1,
      vendor: 'quanto',
      validate(input: unknown): StandardSchemaV1.Result<OpenRange<T>> {
        const problem = shapeProblem(input);
        if (problem) return { issues: [{ message: problem, code: 'invalid' } as Issue] };
        const value = input as OpenRange<T>;
        const start: StandardSchemaV1.Result<T | null> = value.start === null ? { value: null } : validateSide(value.start, 'start');
        const end: StandardSchemaV1.Result<T | null> = value.end === null ? { value: null } : validateSide(value.end, 'end');
        const issues = [...(start.issues ?? []), ...(end.issues ?? [])];
        if (issues.length > 0) return { issues: issues.map((i) => ({ ...i, code: 'invalid' })) };
        // The range schema sees each side's output, so the inner schemas' transforms are kept.
        const sides: OpenRange<T> = {
          start: (start as { value: T | null }).value,
          end: (end as { value: T | null }).value,
          ...(value.startExclusive ? { startExclusive: true } : {}),
          ...(value.endExclusive ? { endExclusive: true } : {}),
        };
        const conflict = sides.start !== null && sides.end !== null ? rules?.incompatible?.(sides.start, sides.end) : undefined;
        if (conflict) return { issues: [{ message: conflict.message, code: 'invalid' } as Issue] };
        if (!userSchema) return { value: sides };
        const validated = runUserSchema(userSchema, sides, id);
        return validated.ok ? { value: validated.value } : { issues: validated.issues };
      },
    },
  };

  return { id, parse, format, schema };
}
