// Codec testing helpers: runFixtures and roundTrip. See DESIGN.md, "Testing: fixtures are the spec".
// Framework-agnostic: callers pass their test function (vitest's `test`, `node:test`, …).

import type { Codec, Ctx, IssueCode, ParseContext } from '../core/types';

/** Registers one test case. Matches vitest's and node:test's `test(name, fn)`. */
export type TestFn = (name: string, fn: () => void) => unknown;

/** A parse fixture: `{ parse, ctx?, options?, value | issues, alternatives?, context? }`. */
export interface ParseFixture {
  readonly parse: string;
  readonly ctx?: Ctx;
  readonly options?: unknown;
  readonly value?: unknown;
  /** Expected issue codes, in order. */
  readonly issues?: readonly IssueCode[];
  /** Expected alternatives. Missing means none are expected. */
  readonly alternatives?: readonly unknown[];
  /** Checked only when given. */
  readonly context?: ParseContext;
}

/** A format fixture: `{ format, ctx?, options?, text }`. */
export interface FormatFixture {
  readonly format: unknown;
  readonly ctx?: Ctx;
  readonly options?: unknown;
  readonly text: string;
}

export type Fixture = ParseFixture | FormatFixture;

/** A codec factory. Fixture `options` are passed to it. */
export type CodecFactory = (options?: never) => Codec<unknown>;

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
  const input = 'parse' in fixture ? `parse ${show(fixture.parse)}` : `format ${show(fixture.format)}`;
  const extras = [fixture.ctx && show(fixture.ctx), fixture.options !== undefined && `options ${show(fixture.options)}`].filter(Boolean);
  return extras.length ? `${input} (${extras.join(', ')})` : input;
}

function checkShape(fixture: unknown, index: number): Fixture {
  const f = fixture as Record<string, unknown>;
  const where = `fixture #${index}`;
  if (!f || typeof f !== 'object') throw new Error(`${where} is not an object.`);
  const isParse = 'parse' in f;
  const isFormat = 'format' in f;
  if (isParse === isFormat) throw new Error(`${where} must have exactly one of "parse" or "format".`);
  if (isParse) {
    if (typeof f.parse !== 'string') throw new Error(`${where}: "parse" must be a string.`);
    if (('value' in f) === ('issues' in f)) throw new Error(`${where}: a parse fixture needs exactly one of "value" or "issues".`);
  } else if (typeof f.text !== 'string') throw new Error(`${where}: a format fixture needs a "text" string.`);
  return f as unknown as Fixture;
}

function runParseFixture(factory: CodecFactory, fixture: ParseFixture, name: string): void {
  const codec = factory(fixture.options as never);
  const result = codec.parse(fixture.parse, fixture.ctx);

  if (fixture.issues) {
    if (result.ok) fail(name, { issues: fixture.issues }, { value: result.value });
    const codes = result.issues.map((i) => i.code);
    if (!approxEqual(codes, fixture.issues)) fail(name, fixture.issues, codes, 'issue codes differ');
    return;
  }

  if (!result.ok) fail(name, { value: fixture.value }, { issues: result.issues });
  if (!approxEqual(result.value, fixture.value)) fail(name, fixture.value, result.value, 'value differs');
  const alternatives = result.alternatives ?? [];
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
      if ('parse' in fixture) runParseFixture(factory, fixture, name);
      else runFormatFixture(factory, fixture, name);
    });
  });
}

/**
 * Registers one test per value, checking that the codec's formatter round-trips: `format(v)` parses,
 * and formatting the parsed value gives the same text. Equal formatted text is what "differs by no
 * more than the formatter's rounding" means, with no tolerance to pick.
 */
export function roundTrip<T>(codec: Codec<T>, values: readonly T[], options: { readonly test: TestFn; readonly ctx?: Ctx }): void {
  const ctx: Ctx = { now: '2026-01-15T12:00:00+00:00', ...options.ctx };
  for (const value of values) {
    const name = `round-trips ${show(value)}${options.ctx ? ` (${show(options.ctx)})` : ''}`;
    options.test(name, () => {
      const text = codec.format(value, ctx);
      const result = codec.parse(text, ctx);
      if (!result.ok) fail(name, `a successful parse of ${show(text)}`, { issues: result.issues });
      const again = codec.format(result.value, ctx);
      if (again !== text) fail(name, text, again, `format(parse(${show(text)})) gives different text`);
    });
  }
}
