// Codec testing helpers: runFixtures, roundTrip and quantityWithin. See DESIGN.md, "Testing: fixtures are the spec".
// Framework-agnostic: callers pass their test function (vitest's `test`, `node:test`, …).

import type { Codec, Completion, Ctx, ExternalCodec, ExternalParseResult, IssueCode, ParseContext, ParseResult, Quantity } from '../core/types';
import { convert, type QuantityTable } from '../quantity';

/** Registers one test case. Matches vitest's and node:test's `test(name, fn)`; `fn` is async for external codecs. */
export type TestFn = (name: string, fn: () => void | Promise<void>) => unknown;

/** A completion as a fixture expects it: lazy ones are resolved through the codec's stub first. */
export interface ExpectedCompletion {
  readonly label: string;
  readonly id?: string;
  readonly value: unknown;
}

/** A parse fixture: `{ parse, ctx?, options?, value | issues, alternatives?, completions?, context? }`. */
export interface ParseFixture {
  readonly parse: string;
  readonly ctx?: Ctx;
  readonly options?: unknown;
  readonly value?: unknown;
  /** Expected issue codes, in order. */
  readonly issues?: readonly IssueCode[];
  /** Expected alternatives, with either `value` or `issues`. Missing means none are expected. */
  readonly alternatives?: readonly unknown[];
  /** External codecs: expected completions on the result. Missing means none are expected. */
  readonly completions?: readonly ExpectedCompletion[];
  /** Checked only when given. */
  readonly context?: ParseContext;
}

/** A complete fixture, for external codecs that complete: `{ complete, ctx?, options?, completions }`. */
export interface CompleteFixture {
  readonly complete: string;
  readonly ctx?: Ctx;
  readonly options?: unknown;
  readonly completions: readonly ExpectedCompletion[];
}

/** A format fixture: `{ format, ctx?, options?, text }`. */
export interface FormatFixture {
  readonly format: unknown;
  readonly ctx?: Ctx;
  readonly options?: unknown;
  readonly text: string;
}

export type Fixture = ParseFixture | FormatFixture | CompleteFixture;

/**
 * A codec factory. Fixture `options` are passed to it. For an external codec, it closes over the
 * codec's stub service.
 */
export type CodecFactory = (options?: never) => Codec<unknown> | ExternalCodec<unknown>;

/** Calls `then` with a parse result, awaiting it first if the codec is external. */
function whenParsed<T>(result: ParseResult<T> | Promise<ParseResult<T>>, then: (result: ParseResult<T>) => void): void | Promise<void> {
  return result instanceof Promise ? result.then(then) : then(result);
}

const RELATIVE_TOLERANCE = 1e-9;

/** Deep equality for JSON data, with a relative tolerance on numbers (conversions drift by an ulp). */
function approxEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b) return true;
    return Math.abs(a - b) <= RELATIVE_TOLERANCE * Math.max(Math.abs(a), Math.abs(b));
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => approxEqual(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
    const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => approxEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a === b;
}

const show = (v: unknown): string => JSON.stringify(v) ?? String(v);

function fail(name: string, expected: unknown, actual: unknown, note?: string): never {
  throw new Error(`${name}${note ? `: ${note}` : ''}\n  expected: ${show(expected)}\n  actual:   ${show(actual)}`);
}

function describeCase(fixture: Fixture): string {
  const input = 'parse' in fixture ? `parse ${show(fixture.parse)}` : 'complete' in fixture ? `complete ${show(fixture.complete)}` : `format ${show(fixture.format)}`;
  const extras = [fixture.ctx && show(fixture.ctx), fixture.options !== undefined && `options ${show(fixture.options)}`].filter(Boolean);
  return extras.length ? `${input} (${extras.join(', ')})` : input;
}

function checkShape(fixture: unknown, index: number): Fixture {
  const f = fixture as Record<string, unknown>;
  const where = `fixture #${index}`;
  if (!f || typeof f !== 'object') throw new Error(`${where} is not an object.`);
  const kinds = ['parse', 'format', 'complete'].filter((kind) => kind in f);
  if (kinds.length !== 1) throw new Error(`${where} must have exactly one of "parse", "format" or "complete".`);
  if ('parse' in f) {
    if (typeof f.parse !== 'string') throw new Error(`${where}: "parse" must be a string.`);
    if (('value' in f) === ('issues' in f)) throw new Error(`${where}: a parse fixture needs exactly one of "value" or "issues".`);
  } else if ('complete' in f) {
    if (typeof f.complete !== 'string') throw new Error(`${where}: "complete" must be a string.`);
    if (!Array.isArray(f.completions)) throw new Error(`${where}: a complete fixture needs a "completions" array.`);
  } else if (typeof f.text !== 'string') throw new Error(`${where}: a format fixture needs a "text" string.`);
  return f as unknown as Fixture;
}

function runParseFixture(factory: CodecFactory, fixture: ParseFixture, name: string): void | Promise<void> {
  const codec = factory(fixture.options as never);
  const result = codec.parse(fixture.parse, fixture.ctx);
  if (!(result instanceof Promise)) {
    if (fixture.completions) fail(name, fixture.completions, 'a sync codec', 'only external codecs have completions');
    return checkParse(fixture, name, result);
  }
  return result.then(async (settled: ExternalParseResult<unknown>) => {
    checkParse(fixture, name, settled);
    const completions = await expectedForm(settled.completions ?? [], fixture.ctx);
    if (!approxEqual(completions, fixture.completions ?? [])) fail(name, fixture.completions ?? [], completions, 'completions differ');
  });
}

/** Completions in a fixture's terms: `{ label, id?, value }`, resolving lazy ones through the codec's stub. */
async function expectedForm(completions: readonly Completion<unknown>[], ctx: Ctx | undefined): Promise<ExpectedCompletion[]> {
  const out: ExpectedCompletion[] = [];
  for (const completion of completions) {
    const value = 'value' in completion ? completion.value : await completion.resolve(ctx);
    out.push(completion.id === undefined ? { label: completion.label, value } : { label: completion.label, id: completion.id, value });
  }
  return out;
}

async function runCompleteFixture(factory: CodecFactory, fixture: CompleteFixture, name: string): Promise<void> {
  const codec = factory(fixture.options as never);
  if (!('complete' in codec) || !codec.complete) fail(name, 'a codec with complete()', codec.id, "the codec doesn't complete");
  const completions = await expectedForm(await codec.complete(fixture.complete, fixture.ctx), fixture.ctx);
  if (!approxEqual(completions, fixture.completions)) fail(name, fixture.completions, completions, 'completions differ');
}

function checkParse(fixture: ParseFixture, name: string, result: ParseResult<unknown>): void {
  const alternatives = result.alternatives ?? [];
  if (fixture.issues) {
    if (result.ok) fail(name, { issues: fixture.issues }, { value: result.value });
    const codes = result.issues.map((i) => i.code);
    if (!approxEqual(codes, fixture.issues)) fail(name, fixture.issues, codes, 'issue codes differ');
    if (!approxEqual(alternatives, fixture.alternatives ?? [])) fail(name, fixture.alternatives ?? [], alternatives, 'alternatives differ');
    return;
  }

  if (!result.ok) fail(name, { value: fixture.value }, { issues: result.issues });
  if (!approxEqual(result.value, fixture.value)) fail(name, fixture.value, result.value, 'value differs');
  if (!approxEqual(alternatives, fixture.alternatives ?? [])) fail(name, fixture.alternatives ?? [], alternatives, 'alternatives differ');
  if (fixture.context && !approxEqual(result.context, fixture.context)) fail(name, fixture.context, result.context, 'context differs');
  if (result.context.now !== undefined && fixture.ctx?.now === undefined) {
    fail(name, 'no machine clock', result.context, 'the parse read the machine clock; pass ctx.now so the fixture is deterministic');
  }
}

function runFormatFixture(factory: CodecFactory, fixture: FormatFixture, name: string): void {
  const codec = factory(fixture.options as never);
  const text = codec.format(fixture.format, fixture.ctx);
  if (text !== fixture.text) fail(name, fixture.text, text, 'formatted text differs');
}

/**
 * Registers one test per fixture. `fixtures` is usually an imported `fixtures.json`; its shape is
 * checked when each test runs.
 */
export function runFixtures(factory: CodecFactory, fixtures: readonly unknown[], options: { readonly test: TestFn }): void {
  fixtures.forEach((raw, index) => {
    let name: string;
    try {
      name = describeCase(raw as Fixture);
    } catch {
      name = `fixture #${index}`;
    }
    options.test(name, () => {
      const fixture = checkShape(raw, index);
      if ('parse' in fixture) return runParseFixture(factory, fixture, name);
      if ('complete' in fixture) return runCompleteFixture(factory, fixture, name);
      runFormatFixture(factory, fixture, name);
    });
  });
}

/**
 * Registers one test per value, checking that the codec's formatter round-trips: `format(v)` parses
 * to a value `same` as `v`, and formatting that value gives the same text. `same` defaults to deep
 * equality (numbers to an ulp of conversion drift), which suits exact values: money, dates, text. For
 * a formatter that rounds, pass what its rounding allows, such as `quantityWithin`.
 */
export function roundTrip<T>(
  codec: Codec<T> | ExternalCodec<T>,
  values: readonly T[],
  options: { readonly test: TestFn; readonly ctx?: Ctx; readonly same?: ((original: T, parsed: T) => boolean) | undefined },
): void {
  const ctx: Ctx = { now: '2026-01-15T12:00:00+00:00', ...options.ctx };
  const same = options.same ?? approxEqual;
  for (const value of values) {
    const name = `round-trips ${show(value)}${options.ctx ? ` (${show(options.ctx)})` : ''}`;
    options.test(name, () => {
      const text = codec.format(value, ctx);
      return whenParsed(codec.parse(text, ctx), (result) => {
        if (!result.ok) fail(name, `a successful parse of ${show(text)}`, { issues: result.issues });
        if (!same(value, result.value)) fail(name, value, result.value, `parse(${show(text)}) gives a different value`);
        const again = codec.format(result.value, ctx);
        if (again !== text) fail(name, text, again, `format(parse(${show(text)})) gives different text`);
      });
    });
  }
}

/**
 * A `same` for quantity codecs whose formatter rounds: both values, converted to `unit` (default: the
 * original's unit), differ by at most half a unit in the `places`-th decimal place. The default
 * formatter prints 2 places; `feetInches` rounds to whole inches, so it's `{ unit: 'in', places: 0 }`.
 */
export function quantityWithin<U extends string>(
  codec: QuantityTable<U>,
  rounding: { readonly places: number; readonly unit?: NoInfer<U> | undefined },
): (original: Quantity<U>, parsed: Quantity<U>) => boolean {
  const tolerance = 0.5 * 10 ** -rounding.places * (1 + RELATIVE_TOLERANCE);
  return (original, parsed) => {
    const unit = rounding.unit ?? original.unit;
    const a = convert(codec, original, unit).value;
    const b = convert(codec, parsed, unit).value;
    return Math.abs(a - b) <= tolerance + RELATIVE_TOLERANCE * Math.max(Math.abs(a), Math.abs(b));
  };
}
