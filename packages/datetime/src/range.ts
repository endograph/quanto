import { defineRange, type Codec, type OpenRange, type Range, type RangeOptions, type RangeProposal } from 'quanto';
import { instantSeconds, rollIso } from './calendar/civil';
import { calendarKindOf, spanFormatOf } from './calendar/codecs';

type Sides = readonly [string, string];
type Strategy = (left: string, right: string) => RangeProposal<string>[];

/** A proposal whose end may roll forward a day or a year if the range comes out of order. */
const as = (sides: Sides, roll?: 'day' | 'week' | 'year'): RangeProposal<string> =>
  roll ? { sides, adjustEnd: (end) => rollIso(end, roll) } : { sides };

const dedupe = (proposals: RangeProposal<string>[]): RangeProposal<string>[] => {
  const seen = new Set<string>();
  return proposals.filter(({ sides: [l, r], adjustEnd }) => {
    const key = `${l}\u0000${r}\u0000${adjustEnd ? 'roll' : ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const YEAR = /(?<!\d)\d{4}(?!\d)/;
const DAY_ONLY = /^(\d{1,2}(?:st|nd|rd|th)?)(?:,?\s*(\d{4}))?$/i;
const DAY_IN_TEXT = /(?<![\d:])\d{1,2}(?:st|nd|rd|th)?(?![\d:])/i;
const hasMonthName = (side: string): boolean => /\p{L}{3,}/u.test(side) && !/^(?:today|tomorrow|yesterday)$/i.test(side.trim());
/** A weekday with no date: `fri`, `next fri`, `Freitag`. */
const isWeekday = (side: string): boolean =>
  /^(?:(?:this|next|last)\s+)?\p{L}+\.?$/iu.test(side.trim()) && !/^(?:today|tomorrow|yesterday)$/i.test(side.trim());

/**
 * A side with only a day number borrows the other side's month and year (`Oct 3-5`); a side with no
 * year borrows the other's (`Oct 30 - Nov 2, 2027`). If the range comes out backwards, the end rolls
 * forward: a year for two dates with day numbers and no years (`Dec 30 - Jan 2`), a week for an end
 * that's a bare weekday (`next mon - fri`). Other ranges are kept as typed.
 */
const date: Strategy = (left, right) => {
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
  const datedWithoutYear = (side: string): boolean => DAY_IN_TEXT.test(side) && !YEAR.test(side);
  const roll = datedWithoutYear(l) && datedWithoutYear(r) ? 'year' : isWeekday(right) ? 'week' : undefined;
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

  const proposals: RangeProposal<string>[] = [];
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

/** Dates, times and local date-times order as strings; date-times as instants. */
function inOrder(start: string, end: string): boolean | undefined {
  if (start.length > 19 || end.length > 19) {
    const a = instantSeconds(start);
    const b = instantSeconds(end);
    return a === undefined || b === undefined ? undefined : a <= b;
  }
  return start <= end;
}

const STRATEGIES = { date, time, localDateTime: dateTime, dateTime } as const;

/**
 * A range of dates, times or date-times, for any of `date()`, `time()`, `localDateTime()` and
 * `dateTime()`: `Oct 3-5`, `Oct 30 - Nov 2, 2027`, `Dec 30 - Jan 2`, `9-5pm`, `Oct 3 3-5pm`,
 * `Oct 3 10pm-1am`. A side borrows what it's missing from the other; an end that would come before the
 * start rolls into the next day or year. Two dates in one year format shortened: `Oct 3–5, 2026`. With
 * `open: true`, also one bound: `after Oct 3`, `until Friday`.
 * See the repository's DESIGN.md, Ranges.
 */
export function dateRange(codec: Codec<string>, options: RangeOptions<OpenRange<string>> & { readonly open: true }): Codec<OpenRange<string>>;
export function dateRange(codec: Codec<string>, options?: RangeOptions<Range<string>> & { readonly open?: false | undefined }): Codec<Range<string>>;
export function dateRange(codec: Codec<string>, options?: RangeOptions<OpenRange<string>> | RangeOptions<Range<string>>): Codec<OpenRange<string>> | Codec<Range<string>> {
  const kind = calendarKindOf(codec);
  if (!kind) {
    throw new Error('quanto: dateRange works with codecs made by date(), time(), localDateTime() or dateTime() from quanto-datetime. For other codecs, use defineRange from quanto.');
  }
  const strategy = STRATEGIES[kind];
  const format = spanFormatOf(codec);
  return defineRange(codec, { propose: (left, right) => strategy(left, right), inOrder, ...(format ? { format } : {}) }, options as RangeOptions<OpenRange<string>> & { readonly open: true });
}
