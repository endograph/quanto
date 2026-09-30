// Completion strategies for range(): each proposes textual completions of the two sides, in order of
// preference, ending with the sides as typed. See DESIGN.md, Ranges. Inner codecs know nothing about
// ranges, so this duplicates a little lexing on purpose.

import type { CodecKind, ResolvedCtx } from '../core/types';
import { readNumber } from '../primitives/number';

export type Sides = readonly [string, string];

/**
 * A proposed completion. `roll` marks one where the end may be moved forward a day or a year after
 * parsing, if that puts the range in order: `Oct 3 10pm-1am`, `Dec 30 - Jan 2`.
 */
export interface Proposal {
  readonly sides: Sides;
  readonly roll?: 'day' | 'year' | undefined;
}

export type Strategy = (left: string, right: string, ctx: ResolvedCtx) => Proposal[];

/** Where the first number in a side starts and ends. */
function numberSpan(side: string, ctx: ResolvedCtx): { start: number; end: number } | undefined {
  const start = side.search(/\d|[.,]\d/);
  if (start < 0) return undefined;
  // Clock notation is one number to a range: `5:00-5:30 /km` (pace).
  const clock = /^\d+:[0-5]\d(?::[0-5]\d)?(?:[.,]\d+)?/.exec(side.slice(start));
  if (clock) return { start, end: start + clock[0].length };
  const n = readNumber(side, ctx, { from: start });
  return n ? { start, end: n.end } : undefined;
}

const dedupe = (proposals: Proposal[]): Proposal[] => {
  const seen = new Set<string>();
  return proposals.filter(({ sides: [l, r], roll }) => {
    const key = `${l}\u0000${r}\u0000${roll ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const as = (sides: Sides, roll?: 'day' | 'year'): Proposal => (roll ? { sides, roll } : { sides });

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
  const proposals: Proposal[] = [];
  if (l && r && l.bare && !r.bare && r.unit.trim()) proposals.push(as([left + r.unit, right]));
  if (l && r && r.bare && !l.bare && l.unit.trim()) proposals.push(as([left, right + l.unit]));
  return dedupe([...proposals, as([left, right])]);
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
  if (!l || !r) return [as([left, right])];
  type Side = NonNullable<typeof l>;
  const build = (s: Side, currency: Side, magnitude: string): string => `${s.sign}${currency.currencyPrefix}${s.number}${magnitude}${currency.tail}`;
  const withCurrency = (s: Side, other: Side): Side => (s.hasCurrency ? s : { ...s, currencyPrefix: other.currencyPrefix, tail: other.tail });
  const lc = withCurrency(l, r);
  const rc = withCurrency(r, l);
  const lMag = l.magnitude || r.magnitude;
  const rMag = r.magnitude || l.magnitude;
  return dedupe([
    as([build(lc, lc, lMag), build(rc, rc, rMag)]),
    as([build(lc, lc, l.magnitude), build(rc, rc, r.magnitude)]),
    as([left, right]),
  ]);
};

const asTyped: Strategy = (left, right) => [as([left, right])];

const YEAR = /(?<!\d)\d{4}(?!\d)/;
const DAY_ONLY = /^(\d{1,2}(?:st|nd|rd|th)?)(?:,?\s*(\d{4}))?$/i;
const DAY_IN_TEXT = /(?<![\d:])\d{1,2}(?:st|nd|rd|th)?(?![\d:])/i;
const hasMonthName = (side: string): boolean => /\p{L}{3,}/u.test(side) && !/^(?:today|tomorrow|yesterday)$/i.test(side.trim());

/**
 * A side with only a day number borrows the other side's month and year (`Oct 3-5`); a side with no
 * year borrows the other's (`Oct 30 - Nov 2, 2027`). With no year on either side, the end may roll
 * into the next year (`Dec 30 - Jan 2`).
 */
const date: Strategy = (left, right) => {
  const roll = !YEAR.test(left) && !YEAR.test(right) ? 'year' : undefined;
  let l = left;
  let r = right;
  // A day (and maybe a year) alone takes the other side's text with its own day: "Oct 3-5, 2027".
  const withDay = (dayOnly: RegExpExecArray, other: string): string => {
    const replaced = other.replace(DAY_IN_TEXT, dayOnly[1]!);
    return dayOnly[2] ? `${replaced.replace(YEAR, '').replace(/[,\s]+$/, '')}, ${dayOnly[2]}` : replaced;
  };
  const ld = DAY_ONLY.exec(l);
  const rd = DAY_ONLY.exec(r);
  if (ld && !rd && hasMonthName(r)) l = withDay(ld, r);
  else if (rd && !ld && hasMonthName(l)) r = withDay(rd, l);
  const withYears: Sides = [l, r];
  const ly = YEAR.exec(l)?.[0];
  const ry = YEAR.exec(r)?.[0];
  const yearBorrowed: Sides = [
    !ly && ry && hasMonthName(l) ? `${l}, ${ry}` : l,
    !ry && ly && hasMonthName(r) ? `${r}, ${ly}` : r,
  ];
  return dedupe([as(yearBorrowed, roll), as(withYears, roll), as([left, right], roll)]);
};

const MERIDIEM = /\s*(a\.?m\.?|p\.?m\.?|[ap])$/i;
const TIME = '\\d{1,2}(?::\\d{2}){0,2}(?:\\s*(?:[ap]\\.?m\\.?|[ap]))?';
const TIME_ONLY = new RegExp(`^${TIME}$`, 'i');
const TIME_AT_END = new RegExp(`^(.+?)\\s+(?:at\\s+)?(${TIME})$`, 'i');
const TIME_AT_START = new RegExp(`^(${TIME})\\s+(.+)$`, 'i');
const OFFSET = /\s*(z|utc|gmt|[+-]\d{2}:?\d{2})$/i;

const opposite = (meridiem: string): string => meridiem.replace(/[ap]/i, (c) => (c.toLowerCase() === 'a' ? 'p' : 'a'));

/**
 * A time with no meridiem borrows the other's, and failing that the opposite one: `9-11pm` is 9pm–11pm,
 * `9-5pm` is 9am–5pm. Returns the variants in order of preference.
 */
function meridiemVariants(a: string, b: string): Sides[] {
  const am = MERIDIEM.exec(a)?.[1];
  const bm = MERIDIEM.exec(b)?.[1];
  if (!am && bm) return [[a + bm, b], [a + opposite(bm), b]];
  if (am && !bm) return [[a, b + am], [a, b + opposite(am)]];
  return [];
}

const time: Strategy = (left, right) => dedupe([...meridiemVariants(left, right).map((s) => as(s)), as([left, right])]);

/**
 * Date-times: a side that is only a time borrows the other side's date, wherever it was written
 * (`Oct 3 3-5pm`, `3-5pm tomorrow`), and may roll into the next day (`Oct 3 10pm-1am`). Times then
 * complete as in `time`; a side with no offset borrows the other's.
 */
const dateTime: Strategy = (left, right) => {
  const lo = OFFSET.exec(left)?.[1];
  const ro = OFFSET.exec(right)?.[1];
  const l = left.replace(OFFSET, '');
  const r = right.replace(OFFSET, '');

  // Split a side into its date text, its time, and where the time goes.
  const parts = (side: string) => {
    if (TIME_ONLY.test(side)) return { date: '', time: side, atEnd: true };
    const end = TIME_AT_END.exec(side);
    if (end) return { date: end[1]!, time: end[2]!, atEnd: true };
    const start = TIME_AT_START.exec(side);
    if (start) return { date: start[2]!, time: start[1]!, atEnd: false };
    return undefined;
  };
  const lp = parts(l);
  const rp = parts(r);
  let roll: 'day' | undefined;
  const join = (dateText: string, t: string, atEnd: boolean): string => (dateText ? (atEnd ? `${dateText} ${t}` : `${t} ${dateText}`) : t);

  const proposals: Proposal[] = [];
  if (lp && rp) {
    let lDate = lp.date;
    let rDate = rp.date;
    if (!rDate && lDate) {
      rDate = lDate;
      roll = 'day';
    } else if (!lDate && rDate) lDate = rDate;
    const withOffsets = ([a, b]: Sides): Sides => [a + (lo || ro ? ` ${lo ?? ro}` : ''), b + (lo || ro ? ` ${ro ?? lo}` : '')];
    const variants = [...meridiemVariants(lp.time, rp.time), [lp.time, rp.time] as Sides];
    const dateOwner = lp.date ? lp : rp;
    for (const [lt, rt] of variants) {
      proposals.push(as(withOffsets([join(lDate, lt, dateOwner.atEnd), join(rDate, rt, dateOwner.atEnd)]), roll));
    }
  }
  return dedupe([...proposals, as([left, right])]);
};

/** The strategy for a codec kind. */
export function strategyFor(kind: CodecKind | undefined): Strategy {
  switch (kind) {
    case 'quantity':
      return quantity;
    case 'money':
      return money;
    case 'date':
      return date;
    case 'time':
      return time;
    case 'localDateTime':
    case 'dateTime':
      return dateTime;
    default:
      return asTyped;
  }
}
