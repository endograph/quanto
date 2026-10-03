// An offset in calendar units from some date the app supplies: `3 days`, `2 weeks before`, `in 6 months`.
// See DESIGN.md, "Date offsets". The value is a signed ISO 8601 duration that Temporal applies directly;
// nothing here does date arithmetic, and `now` is never read.

import { defineCodec, formatNumber, normalize, readNumber, type Codec, type CodecOptions, type ParseOutcome, type ResolvedCtx } from 'quanto';

type Part = 'Y' | 'M' | 'W' | 'D';
type Counts = Partial<Record<Part, number>>;

/** Largest to smallest, the order ISO 8601 writes them and the order compound input must use. */
const PARTS: readonly Part[] = ['Y', 'M', 'W', 'D'];

const UNIT_WORDS: Readonly<Record<string, Part>> = {
  y: 'Y', yr: 'Y', yrs: 'Y', year: 'Y', years: 'Y',
  mo: 'M', mos: 'M', mth: 'M', mths: 'M', month: 'M', months: 'M',
  w: 'W', wk: 'W', wks: 'W', week: 'W', weeks: 'W',
  d: 'D', day: 'D', days: 'D',
};

const NAMES: Readonly<Record<Part, readonly [string, string]>> = {
  Y: ['year', 'years'],
  M: ['month', 'months'],
  W: ['week', 'weeks'],
  D: ['day', 'days'],
};

/** Temporal rejects years, months and weeks from 2³² up; days are held to the same bound. */
const LIMIT = 2 ** 32;

/** Whole phrases with a fixed offset. */
const PHRASES: Readonly<Record<string, string>> = {
  today: 'P0D',
  'same day': 'P0D',
  'the same day': 'P0D',
  tomorrow: 'P1D',
  yesterday: '-P1D',
};

const THE_UNIT = /^the (day|week|month|year) (before|after)$/;
const ISO = /^([+-]?)p(?:(\d+)y)?(?:(\d+)m)?(?:(\d+)w)?(?:(\d+)d)?$/;
const CANONICAL = /^(-?)P(?:([1-9]\d*)Y)?(?:([1-9]\d*)M)?(?:([1-9]\d*)W)?(?:([1-9]\d*)D)?$/;
const SEPARATOR = /^\s*(?:,|&|and(?!\p{L}))\s*/u;
const BACKWARD = /^(?:ago|before|earlier|prior)$/;
const FORWARD = /^(?:after|later|from now)$/;

/** The canonical value: zero parts dropped, `P0D` for zero, and a sign only on a non-zero offset. */
function toIso(counts: Counts, negative: boolean): string {
  const body = PARTS.filter((p) => (counts[p] ?? 0) !== 0).map((p) => `${counts[p]}${p}`).join('');
  return body === '' ? 'P0D' : `${negative ? '-' : ''}P${body}`;
}

/** The parts of a canonical value, or undefined if it isn't one. */
function fromIso(value: unknown): { counts: Counts; negative: boolean } | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === 'P0D') return { counts: {}, negative: false };
  const m = CANONICAL.exec(value);
  if (!m || value.length === m[1]!.length + 1) return undefined;
  const counts: Counts = {};
  for (const [i, p] of PARTS.entries()) {
    if (m[i + 2] === undefined) continue;
    const n = Number(m[i + 2]);
    if (n >= LIMIT) return undefined;
    counts[p] = n;
  }
  return { counts, negative: m[1] === '-' };
}

const issue = (code: 'unparseable' | 'missing_unit' | 'unknown_unit', message: string): ParseOutcome<string> => ({ ok: false, issues: [{ code, message }] });

const tooBig = (n: number): boolean => Math.abs(n) >= LIMIT;

function parse(text: string, ctx: ResolvedCtx): ParseOutcome<string> {
  const s = normalize(text).trim().toLowerCase();
  const unparseable = issue('unparseable', `Couldn't understand "${text}" as a date offset, like "3 days", "2 weeks before" or "in 6 months".`);
  const whole = issue('unparseable', 'Use whole numbers of days, weeks, months or years: a date offset has no fractions.');

  const phrase = PHRASES[s];
  if (phrase) return { ok: true, value: phrase };
  const the = THE_UNIT.exec(s);
  if (the) return { ok: true, value: toIso({ [UNIT_WORDS[the[1]!]!]: 1 }, the[2] === 'before') };

  const iso = ISO.exec(s);
  if (iso) {
    if (iso.slice(2).every((g) => g === undefined)) return unparseable;
    const counts: Counts = {};
    for (const [i, p] of PARTS.entries()) if (iso[i + 2] !== undefined) counts[p] = Number(iso[i + 2]);
    if (Object.values(counts).some(tooBig)) return whole;
    return { ok: true, value: toIso(counts, iso[1] === '-') };
  }

  let pos = 0;
  const leadingIn = /^in /.test(s);
  if (leadingIn) pos = 3;
  const signed = s[pos] === '-' || s[pos] === '+';
  const negativeSign = s[pos] === '-';

  const counts: Counts = {};
  let last = -1;
  let direction: 'backward' | 'forward' | undefined;
  while (true) {
    while (s[pos] === ' ') pos++;
    // Only the first part carries a sign, and it applies to the whole offset.
    if (last >= 0 && (s[pos] === '-' || s[pos] === '+')) return unparseable;
    const n = readNumber(s, ctx, { from: pos });
    if (!n) return unparseable;
    if (!Number.isInteger(n.value) || tooBig(n.value)) return whole;
    pos = n.end;

    const word = /^ ?(\p{L}+)\.?/u.exec(s.slice(pos));
    if (!word || BACKWARD.test(word[1]!) || /^(?:after|later|from)$/.test(word[1]!)) {
      return s.slice(pos).trim() === '' || word ? issue('missing_unit', 'Add a unit: days, weeks, months or years.') : unparseable;
    }
    const part = UNIT_WORDS[word[1]!];
    if (!part) return issue('unknown_unit', `"${word[1]}" isn't a date offset unit. Use days, weeks, months or years.`);
    const index = PARTS.indexOf(part);
    if (index <= last) return unparseable;
    last = index;
    counts[part] = Math.abs(n.value);
    pos += word[0].length;

    const rest = s.slice(pos).trim();
    if (rest === '') break;
    if (BACKWARD.test(rest) || FORWARD.test(rest)) {
      direction = BACKWARD.test(rest) ? 'backward' : 'forward';
      break;
    }
    const separator = SEPARATOR.exec(s.slice(pos));
    if (separator) pos += separator[0].length;
    else if (s[pos] !== ' ' && !/\d/.test(s[pos] ?? '')) return unparseable;
  }

  // One way of saying the direction: a sign, `in`, or a word after.
  if ([signed, leadingIn, direction !== undefined].filter(Boolean).length > 1) return unparseable;
  return { ok: true, value: toIso(counts, negativeSign || direction === 'backward') };
}

function format(value: string, ctx: ResolvedCtx): string {
  const { counts, negative } = fromIso(value)!;
  const parts = PARTS.filter((p) => counts[p] !== undefined).map((p) => {
    const n = counts[p]!;
    return `${formatNumber(n, ctx, { maxFractionDigits: 0 })} ${NAMES[p][n === 1 ? 0 : 1]}`;
  });
  if (parts.length === 0) return '0 days';
  return negative ? `${parts.join(' ')} before` : parts.join(' ');
}

/**
 * An offset in calendar units from a date the app supplies (a due date, a signup date, today), stored as a
 * signed ISO 8601 duration: `3 days` is `P3D`, `2 weeks before` is `-P2W`, `in 1 year and 6 months` is
 * `P1Y6M`. Days, weeks, months and years only, in whole numbers, kept as written (`2 weeks` stays `P2W`).
 * Apply one with Temporal: `Temporal.PlainDate.from(due).add(value)`. Unlike `date()`, the text is never
 * resolved against `now`, so `in 3 days` stays three days from whatever the offset is applied to.
 */
export function dateOffset(options?: CodecOptions<string>): Codec<string> {
  return defineCodec<string>({
    id: 'dateOffset',
    parse,
    format,
    check: (value) => (fromIso(value) ? [] : [{ message: 'Expected a date offset as an ISO 8601 duration in years, months, weeks and days, like "P3D" or "-P1Y6M".' }]),
    options,
  });
}
