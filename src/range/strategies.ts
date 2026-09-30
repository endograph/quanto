// Completion strategies for range(): each proposes textual completions of the two sides, in order of
// preference, ending with the sides as typed. See DESIGN.md, Ranges. Inner codecs know nothing about
// ranges, so this duplicates a little lexing on purpose.

import type { CodecKind, ResolvedCtx } from '../core/types';
import { readNumber } from '../primitives/number';

export type Sides = readonly [string, string];
export type Strategy = (left: string, right: string, ctx: ResolvedCtx) => Sides[];

/** Where the first number in a side starts and ends. */
function numberSpan(side: string, ctx: ResolvedCtx): { start: number; end: number } | undefined {
  const start = side.search(/\d|[.,]\d/);
  if (start < 0) return undefined;
  const n = readNumber(side, ctx, { from: start });
  return n ? { start, end: n.end } : undefined;
}

const dedupe = (proposals: Sides[]): Sides[] => {
  const seen = new Set<string>();
  return proposals.filter(([l, r]) => {
    const key = `${l}\u0000${r}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** A side with no unit borrows the other side's first unit text: `5-7 ft` → `5 ft`, `7 ft`. */
const quantity: Strategy = (left, right, ctx) => {
  const analyze = (side: string) => {
    const span = numberSpan(side, ctx);
    if (!span) return undefined;
    const before = side.slice(0, span.start).trim();
    const rest = side.slice(span.end);
    return { bare: (before === '' || before === '-' || before === '+') && rest.trim() === '', unit: /^[^\d]*/.exec(rest)![0].replace(/\s+$/, '') };
  };
  const l = analyze(left);
  const r = analyze(right);
  const proposals: Sides[] = [];
  if (l && r && l.bare && !r.bare && r.unit.trim()) proposals.push([left + r.unit, right]);
  if (l && r && r.bare && !l.bare && l.unit.trim()) proposals.push([left, right + l.unit]);
  return dedupe([...proposals, [left, right]]);
};

const MAGNITUDE = /^(bn|k|m|b|t)(?![\p{L}])/iu;

/**
 * A side with no currency borrows the other side's (`$10-20`, `10-20 EUR`). A side with no magnitude
 * suffix borrows the other's too, first; range() keeps it only if the result is in order, so
 * `$10-20k` is $10k–$20k but `$500-1k` is $500–$1,000.
 */
const money: Strategy = (left, right, ctx) => {
  const analyze = (side: string) => {
    const span = numberSpan(side, ctx);
    if (!span) return undefined;
    const prefix = side.slice(0, span.start);
    const rest = side.slice(span.end);
    const magnitude = MAGNITUDE.exec(rest)?.[0] ?? '';
    const tail = rest.slice(magnitude.length);
    const currencyPrefix = prefix.replace(/[+-]/g, '');
    return {
      sign: /-/.test(prefix) ? '-' : '',
      currencyPrefix,
      number: side.slice(span.start, span.end),
      magnitude,
      tail,
      hasCurrency: currencyPrefix.trim() !== '' || tail.trim() !== '',
    };
  };
  const l = analyze(left);
  const r = analyze(right);
  if (!l || !r) return [[left, right]];
  type Side = NonNullable<typeof l>;
  const build = (s: Side, currency: Side, magnitude: string): string => `${s.sign}${currency.currencyPrefix}${s.number}${magnitude}${currency.tail}`;
  const withCurrency = (s: Side, other: Side): Side => (s.hasCurrency ? s : { ...s, currencyPrefix: other.currencyPrefix, tail: other.tail });
  const lc = withCurrency(l, r);
  const rc = withCurrency(r, l);
  const lMag = l.magnitude || r.magnitude;
  const rMag = r.magnitude || l.magnitude;
  return dedupe([
    [build(lc, lc, lMag), build(rc, rc, rMag)],
    [build(lc, lc, l.magnitude), build(rc, rc, r.magnitude)],
    [left, right],
  ]);
};

const asTyped: Strategy = (left, right) => [[left, right]];

/** The strategy for a codec kind. Date and time strategies arrive with the date codecs. */
export function strategyFor(kind: CodecKind | undefined): Strategy {
  switch (kind) {
    case 'quantity':
      return quantity;
    case 'money':
      return money;
    default:
      return asTyped;
  }
}
