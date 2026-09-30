import { defineCodec } from '../../core/define-codec';
import type { Codec, CodecOptions, ParseOutcome, ResolvedCtx } from '../../core/types';
import { normalize } from '../../primitives/normalize';
import { formatNumber, readNumber } from '../../primitives/number';

/** What a trailing word does to the number: `%` keeps it, `‰` divides by 10, basis points by 100. */
const SCALES: ReadonlyArray<{ readonly words: readonly string[]; readonly divisor: number }> = [
  { words: ['%', 'percent', 'per cent', 'pct'], divisor: 1 },
  { words: ['‰', 'per mille', 'permille', 'per mil'], divisor: 10 },
  { words: ['bp', 'bps', 'basis point', 'basis points'], divisor: 100 },
];

/** `3 in 10`, `3 out of 4`, and a bare fraction `3/4`, are ratios rather than percentages. */
const RATIO = /^(\d+)\s*(?:\/|in|out of)\s*(\d+)$/;

const unparseable = (text: string): ParseOutcome<number> => ({
  ok: false,
  issues: [{ code: 'unparseable', message: `Couldn't understand "${text}" as a percentage, like "12.5%".` }],
});

function parse(text: string, ctx: ResolvedCtx): ParseOutcome<number> {
  const s = normalize(text).toLowerCase();
  const ratio = RATIO.exec(s);
  if (ratio) {
    const [part, whole] = [Number(ratio[1]), Number(ratio[2])];
    return whole === 0 ? unparseable(text) : { ok: true, value: (part / whole) * 100 };
  }
  const n = readNumber(s, ctx);
  if (!n) return unparseable(text);
  const rest = s.slice(n.end).trim();
  const scale = rest === '' ? { divisor: 1 } : SCALES.find((sc) => sc.words.includes(rest));
  if (!scale) return unparseable(text);
  const value = n.value / scale.divisor;
  return { ok: true, value: value === 0 ? 0 : value };
}

/**
 * Percentages: `12.5%`, `12.5`, `50 bps`, `5‰`, `3 in 10`, `3/4`. The value is the percentage as a plain
 * number (`12.5`, not `0.125`); a bare number is a percentage. Formats as `12.5%`.
 */
export const percent = (options?: CodecOptions<number>): Codec<number> =>
  defineCodec<number>({
    id: 'percent',
    parse,
    format: (value, ctx) => `${formatNumber(value, ctx)}%`,
    check: (value) => (typeof value === 'number' && Number.isFinite(value) ? [] : [{ message: 'Expected a finite number.' }]),
    options,
  });
