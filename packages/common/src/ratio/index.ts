import { defineCodec, formatNumber, normalize, readNumber, type Codec, type CodecOptions, type ParseOutcome, type ResolvedCtx } from 'quanto';

/** Colons separate any number of terms: `16:9`, `1:2:4`. `∶` is the ratio sign. */
const COLON = /\s*[:∶]\s*/;
/** Words and a slash separate exactly two: `1 to 3`, `5-to-1`, `3 in 10`, `3 out of 4`, `3/4`. */
const PAIR = /^(.+?)(?:\s+(?:to|in|out of)\s+|-to-|\s*\/\s*)(.+)$/i;

const unparseable = (text: string): ParseOutcome<number[]> => ({
  ok: false,
  issues: [{ code: 'unparseable', message: `Couldn't understand "${text}" as a ratio, like "16:9" or "3 in 10".` }],
});

/** One term: a non-negative number, and nothing else. A term can't be a fraction, which would read as a ratio. */
function term(s: string, ctx: ResolvedCtx): number | undefined {
  const t = s.trim();
  if (t === '' || /[/-]/.test(t)) return undefined;
  const n = readNumber(t, ctx);
  if (!n || n.end !== t.length || n.value < 0) return undefined;
  return n.value === 0 ? 0 : n.value;
}

function parse(text: string, ctx: ResolvedCtx): ParseOutcome<number[]> {
  const s = normalize(text).trim();
  const parts = COLON.test(s) ? s.split(COLON) : PAIR.exec(s)?.slice(1);
  if (!parts || parts.length < 2) return unparseable(text);
  const terms = parts.map((p) => term(p, ctx));
  if (terms.some((t) => t === undefined)) return unparseable(text);
  return { ok: true, value: terms as number[] };
}

/**
 * Ratios: `16:9`, `2.39:1`, `1:2:4`, `1 to 3`, `3 in 10`, `3 out of 4`, `3/4`. The value is the terms as
 * written (`[16, 9]`), not reduced and not divided out, so `1920:1080` stays as it is. Terms are
 * non-negative. Formats with colons: `16:9`.
 */
export const ratio = (options?: CodecOptions<number[]>): Codec<number[]> =>
  defineCodec<number[]>({
    id: 'ratio',
    parse,
    format: (value, ctx) => value.map((t) => formatNumber(t, ctx)).join(':'),
    check: (value) =>
      Array.isArray(value) && value.length >= 2 && value.every((t) => typeof t === 'number' && Number.isFinite(t) && t >= 0)
        ? []
        : [{ message: 'Expected an array of two or more non-negative finite numbers.' }],
    options,
  });
