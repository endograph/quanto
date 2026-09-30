import { defineRange, readNumber, type Codec, type CodecOptions, type Range, type RangeProposal, type ResolvedCtx } from 'quanto';
import type { Money } from './types';

const MAGNITUDE = /^(bn|k|m|b|t)(?![\p{L}])/iu;

/** Where the first number in a side starts and ends. */
function numberSpan(side: string, ctx: ResolvedCtx): { start: number; end: number } | undefined {
  const start = side.search(/\d|[.,]\d/);
  if (start < 0) return undefined;
  const n = readNumber(side, ctx, { from: start });
  return n ? { start, end: n.end } : undefined;
}

/**
 * A side with no currency borrows the other side's (`$10-20`, `10-20 EUR`). A side with no magnitude
 * suffix borrows the other's too, first; that reading is kept only if it's in order, so `$10-20k` is
 * $10k–$20k but `$500-1k` is $500–$1,000.
 */
function propose(left: string, right: string, ctx: ResolvedCtx): RangeProposal<Money>[] {
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
  if (!l || !r) return [];
  type Side = NonNullable<typeof l>;
  const build = (s: Side, magnitude: string): string => `${s.sign}${s.currencyPrefix}${s.number}${magnitude}${s.tail}`;
  const withCurrency = (s: Side, other: Side): Side => (s.hasCurrency ? s : { ...s, currencyPrefix: other.currencyPrefix, tail: other.tail });
  const lc = withCurrency(l, r);
  const rc = withCurrency(r, l);
  return [
    { sides: [build(lc, l.magnitude || r.magnitude), build(rc, r.magnitude || l.magnitude)] },
    { sides: [build(lc, l.magnitude), build(rc, r.magnitude)] },
  ];
}

/** Ordered only within one currency. */
const inOrder = (start: Money, end: Money): boolean | undefined => (start.currency === end.currency ? start.minorUnits <= end.minorUnits : undefined);

/**
 * A range of money: `$10-20`, `10-20 EUR`, `$10-20k`, `$500-1k`. A side borrows the other's currency
 * and, where that keeps the range in order, its magnitude suffix.
 */
export function moneyRange(codec: Codec<Money>, options?: CodecOptions<Range<Money>>): Codec<Range<Money>> {
  return defineRange(codec, { propose, inOrder }, options);
}
