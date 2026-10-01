import type { NumberSyntax, QuantityCodec } from '../codecs/quantity';
import { toBaseValue } from '../codecs/quantity/convert';
import type { Codec, CodecOptions, Quantity, ResolvedCtx } from '../core/types';
import { defineRange, type Range, type RangeProposal, type RangeRules } from './define-range';

export { defineRange } from './define-range';
export type { Range, RangeProposal, RangeRules } from './define-range';

/**
 * Where the first number in a side starts and ends, read with the codec's own number syntax, so
 * `5:00-5:30 /km` completes for pace without range knowing about clock notation.
 */
function numberSpan(side: string, ctx: ResolvedCtx, syntax: NumberSyntax): { start: number; end: number } | undefined {
  const start = side.search(/\d|[.,]\d/);
  if (start < 0) return undefined;
  const n = syntax.read(side, ctx, start);
  return n ? { start, end: n.end } : undefined;
}

/** Same tolerance as `compare()` in `quanto/quantity`: equal within drift counts as in order. */
const TOLERANCE = 1e-9;

/** Range rules for quantities: a side with no unit borrows the other side's unit text. */
function quantityRules<U extends string, C extends U>(codec: QuantityCodec<U, C>): RangeRules<Quantity<C>> {
  const base = (q: Quantity<C>): number | undefined => {
    const def = Object.hasOwn(codec.units, q.unit) ? codec.units[q.unit] : undefined;
    const b = def ? toBaseValue(q.value, def) : undefined;
    return b !== undefined && Number.isFinite(b) ? b : undefined;
  };
  return {
    propose(left, right, ctx) {
      const analyze = (side: string) => {
        const span = numberSpan(side, ctx, codec.number);
        if (!span) return undefined;
        const before = side.slice(0, span.start).trim();
        const rest = side.slice(span.end);
        return { bare: (before === '' || before === '-' || before === '+') && rest.trim() === '', unit: /^[^\d]*/.exec(rest)![0].replace(/\s+$/, '') };
      };
      const l = analyze(left);
      const r = analyze(right);
      const proposals: RangeProposal<Quantity<C>>[] = [];
      if (l && r && l.bare && !r.bare && r.unit.trim()) proposals.push({ sides: [left + r.unit, right] });
      if (l && r && r.bare && !l.bare && l.unit.trim()) proposals.push({ sides: [left, right + l.unit] });
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
 * other side's (see DESIGN.md, Ranges). For other kinds of value, use the range function of their
 * package (`dateRange`, `moneyRange`) or `defineRange`.
 */
export function range<U extends string, C extends U>(codec: QuantityCodec<U, C>, options?: CodecOptions<Range<Quantity<C>>>): Codec<Range<Quantity<C>>> {
  return defineRange(codec, quantityRules(codec), options);
}
