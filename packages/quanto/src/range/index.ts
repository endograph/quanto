import type { NumberSyntax, QuantityCodec } from '../codecs/quantity';
import { toBaseValue } from '../codecs/quantity/convert';
import type { Codec, Quantity, ResolvedCtx } from '../core/types';
import { defineRange, type OpenRange, type Range, type RangeOptions, type RangeProposal, type RangeRules } from './define-range';

export { defineRange } from './define-range';
export type { OpenRange, Range, RangeOptions, RangeProposal, RangeRules } from './define-range';

/**
 * Where the first number in a side starts and ends, read with `read` (a codec's own number syntax, so
 * `5:00-5:30 /km` completes for pace without range knowing about clock notation). A number in words
 * starts the side (`five-ten feet`); one in digits may come after a sign or symbol (`$10`).
 */
export function numberSpan(side: string, ctx: ResolvedCtx, read: NumberSyntax['read']): { start: number; end: number } | undefined {
  const first = side.search(/\S/);
  const words = first >= 0 && /\p{L}/u.test(side[first]!) ? read(side, ctx, first) : undefined;
  if (words) return { start: first, end: words.end };
  const start = side.search(/\d|[.,]\d/);
  if (start < 0) return undefined;
  const n = read(side, ctx, start);
  return n ? { start, end: n.end } : undefined;
}

/** A magnitude after a side's number (`2-3k ft`), as the quantity codecs read it. */
const MAGNITUDE = /^(?:bn|k|m| ?thousand| ?million| ?billion)(?![\p{L}\p{N}])/iu;

/** Same tolerance as `compare()` in `quanto/quantity`: equal within drift counts as in order. */
const TOLERANCE = 1e-9;

/**
 * Range rules for quantities: a side with no unit borrows the other side's unit text, and a side with
 * no magnitude borrows the other's where that keeps the range in order (`2-3k ft`, but `500-1k ft`).
 */
function quantityRules<U extends string, C extends U>(codec: QuantityCodec<U, C>): RangeRules<Quantity<C>> {
  const base = (q: Quantity<C>): number | undefined => {
    const def = Object.hasOwn(codec.units, q.unit) ? codec.units[q.unit] : undefined;
    const b = def ? toBaseValue(q.value, def) : undefined;
    return b !== undefined && Number.isFinite(b) ? b : undefined;
  };
  return {
    propose(left, right, ctx) {
      const analyze = (side: string) => {
        const number = numberSpan(side, ctx, codec.number.read);
        if (!number) return undefined;
        // Clock notation read by a plain number syntax (`1:00-1:30 min` for duration) is one number too.
        const span = { ...number, end: number.end + (/^(?::\d{2}){1,2}(?:[.,]\d+)?/.exec(side.slice(number.end))?.[0].length ?? 0) };
        const before = side.slice(0, span.start).trim();
        const rest = side.slice(span.end);
        const magnitude = MAGNITUDE.exec(rest)?.[0] ?? '';
        const tail = rest.slice(magnitude.length);
        const unit = /^[^\d]*/.exec(tail)![0].replace(/\s+$/, '');
        const bare = (before === '' || before === '-' || before === '+') && tail.trim() === '';
        return { head: side.slice(0, span.end), magnitude, tail, unit, bare };
      };
      const l = analyze(left);
      const r = analyze(right);
      if (!l || !r) return [];
      // A bare side borrows the other's unit text; a side with no magnitude borrows the other's, first.
      const lt = l.bare && !r.bare ? r.unit : l.tail;
      const rt = r.bare && !l.bare ? l.unit : r.tail;
      const proposals: RangeProposal<Quantity<C>>[] = [];
      if (l.magnitude !== r.magnitude && (l.magnitude === '' || r.magnitude === '')) {
        proposals.push({ sides: [l.head + (l.magnitude || r.magnitude) + lt, r.head + (r.magnitude || l.magnitude) + rt] });
      }
      if (lt !== l.tail || rt !== r.tail) proposals.push({ sides: [l.head + l.magnitude + lt, r.head + r.magnitude + rt] });
      return proposals;
    },
    inOrder(start, end) {
      const a = base(start);
      const b = base(end);
      return a === undefined || b === undefined ? undefined : a <= b + TOLERANCE * Math.max(Math.abs(a), Math.abs(b));
    },
  };
}

/**
 * A range of quantities: `5-7 ft`, `150 to 180 cm`, `5:00-5:30 /km`. A side with no unit borrows the
 * other side's (see DESIGN.md, Ranges). With `open: true`, also one bound: `5+ ft`, `under 7 ft`. For other kinds of value, use the range function of their
 * package (`dateRange`, `moneyRange`) or `defineRange`.
 */
export function range<U extends string, C extends U>(codec: QuantityCodec<U, C>, options: RangeOptions<OpenRange<Quantity<C>>> & { readonly open: true }): Codec<OpenRange<Quantity<C>>>;
export function range<U extends string, C extends U>(codec: QuantityCodec<U, C>, options?: RangeOptions<Range<Quantity<C>>> & { readonly open?: false | undefined }): Codec<Range<Quantity<C>>>;
export function range<U extends string, C extends U>(codec: QuantityCodec<U, C>, options?: RangeOptions<OpenRange<Quantity<C>>> | RangeOptions<Range<Quantity<C>>>): Codec<OpenRange<Quantity<C>>> | Codec<Range<Quantity<C>>> {
  // One implementation for both: the options' `open` decides the shape at runtime.
  return defineRange(codec, quantityRules(codec), options as RangeOptions<OpenRange<Quantity<C>>> & { readonly open: true });
}
