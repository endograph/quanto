import { defineCodec, formatNumber, normalize, readNumber, type Codec, type CodecOptions, type ParseOutcome, type ResolvedCtx } from 'quanto';

/** A magnitude after the number: a suffix (`1.2k`, `3M`, `2bn`, `1.5t`) or a word (`3 million`). */
const MAGNITUDE = /^(?:(bn|k|m|b|t)| *(thousand|million|billion|trillion)) *$/i;
const MAGNITUDE_EXPONENT: Readonly<Record<string, number>> = { k: 3, m: 6, b: 9, bn: 9, t: 12, thousand: 3, million: 6, billion: 9, trillion: 12 };

/** `value` × 10^`exponent`, exact in decimal: `1.1 million` is 1100000, not 1100000.0000000002. */
const shift = (value: number, exponent: number): number => {
  const [mantissa, exp = '0'] = String(value).split('e');
  return Number(`${mantissa}e${Number(exp) + exponent}`);
};

/** As for quantities: 2 fraction digits, or enough for three significant digits when that would print 0. */
const fractionDigits = (value: number): number =>
  value !== 0 && Math.abs(value) < 0.005 ? -Math.floor(Math.log10(Math.abs(value))) + 2 : 2;

function parse(text: string, ctx: ResolvedCtx): ParseOutcome<number> {
  const s = normalize(text).trim();
  const n = readNumber(s, ctx);
  const rest = n ? s.slice(n.end) : '';
  // An expression takes no magnitude: in "2*3k" it's unclear what the k applies to.
  const magnitude = n && !/[\^*×·⋅]/.test(s.slice(0, n.end)) ? MAGNITUDE.exec(rest) : null;
  if (!n || (rest.trim() !== '' && !magnitude)) {
    return { ok: false, issues: [{ code: 'unparseable', message: `Couldn't understand "${text}" as a number, like "1,234.5" or "1.2k".` }] };
  }
  const value = magnitude ? shift(n.value, MAGNITUDE_EXPONENT[(magnitude[1] ?? magnitude[2])!.toLowerCase()]!) : n.value;
  return { ok: true, value: value === 0 ? 0 : value };
}

/**
 * Plain numbers, with no unit: `1,234.5`, `1.2k`, `3 million`, `twelve`. Separators follow the locale, as
 * everywhere. Formats like a quantity's number, to 2 fraction digits. Integers, ranges and the like are the
 * `schema`'s job.
 */
export const number = (options?: CodecOptions<number>): Codec<number> =>
  defineCodec<number>({
    id: 'number',
    parse,
    format: (value, ctx) => formatNumber(value, ctx, { maxFractionDigits: fractionDigits(value) }),
    check: (value) => (typeof value === 'number' && Number.isFinite(value) ? [] : [{ message: 'Expected a finite number.' }]),
    options,
  });
