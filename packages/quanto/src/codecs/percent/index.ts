import { defineCodec } from '../../core/define-codec';
import type { Codec, CodecOptions, ParseOutcome, ResolvedCtx } from '../../core/types';
import { normalize } from '../../primitives/normalize';
import { formatNumber, readNumber } from '../../primitives/number';

const WORDS = ['%', 'percent', 'per cent', 'pct'];
const FRACTION_WORD = /\b(?:half|halves|thirds?|quarters?|fourths?|fifths?|eighths?|sixteenths?)\b/;

const unparseable = (text: string): ParseOutcome<number> => ({
  ok: false,
  issues: [{ code: 'unparseable', message: `Couldn't understand "${text}" as a percentage, like "12.5%".` }],
});

function parse(text: string, ctx: ResolvedCtx): ParseOutcome<number> {
  let s = normalize(text).toLowerCase();
  // The sign can come first, as in Turkish: "%50".
  const prefixed = s.startsWith('%');
  if (prefixed) s = s.slice(1);
  const n = readNumber(s, ctx);
  if (!n) return unparseable(text);
  const rest = s.slice(n.end).trim();
  if (rest !== '' && (prefixed || !WORDS.includes(rest))) return unparseable(text);
  // A bare fraction could mean a ratio (3/4 or "half" as 75% or 50%) or a tiny percentage; neither is safe to guess.
  const written = s.slice(0, n.end);
  if (rest === '' && !prefixed && (written.includes('/') || FRACTION_WORD.test(written))) return unparseable(text);
  return { ok: true, value: n.value === 0 ? 0 : n.value };
}

/**
 * Percentages: `12.5%`, `%12.5`, `12.5`, `12.5 percent`. The value is the percentage as a plain number (`12.5`,
 * not `0.125`); a bare number is a percentage. Ratios (`3 in 10`), basis points and per mille aren't
 * accepted, and neither is a bare fraction (`3/4`). Formats as `12.5%`.
 */
export const percent = (options?: CodecOptions<number>): Codec<number> =>
  defineCodec<number>({
    id: 'percent',
    parse,
    format: (value, ctx) => `${formatNumber(value, ctx)}%`,
    check: (value) => (typeof value === 'number' && Number.isFinite(value) ? [] : [{ message: 'Expected a finite number.' }]),
    options,
  });
