// The date and time grammar shared by date(), time(), localDateTime() and dateTime(). It covers the
// common forms only (see DESIGN.md, Dates and times, for what's deliberately left out). Anything the
// grammar doesn't consume makes the input unparseable; nothing is silently ignored except a weekday
// name written next to an explicit date ("Fri, Oct 2").

import { normalize, type Locale, type ResolvedCtx } from 'quanto';
import { addDays, type CivilDate, type CivilTime, isValidDate, isValidTime, normalizeOffset, parseNow, weekdayOf } from './civil';

/** What the text said, resolved against `now` where needed. */
export interface Moment {
  readonly date?: CivilDate | undefined;
  readonly time?: CivilTime | undefined;
  /** `±HH:MM`. */
  readonly offset?: string | undefined;
  /** The date came only from the word `now`, so a time-only codec may ignore it. */
  readonly dateFromNow?: boolean | undefined;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface NameTables {
  readonly months: RegExp;
  readonly monthIndex: ReadonlyMap<string, number>;
  readonly weekdays: RegExp;
  readonly weekdayIndex: ReadonlyMap<string, number>;
}

const tableCache = new Map<string, NameTables>();

/** Month and weekday names for the locale's language plus English, longest first. */
function nameTables(locale: Locale): NameTables {
  const cached = tableCache.get(locale.names.language);
  if (cached) return cached;
  const monthIndex = new Map<string, number>();
  const weekdayIndex = new Map<string, number>();
  for (const names of locale.acceptedNames) {
    names.months.long.forEach((n, i) => monthIndex.set(n.toLowerCase(), i + 1));
    names.months.short.forEach((n, i) => monthIndex.set(n.toLowerCase(), i + 1));
    names.weekdays.long.forEach((n, i) => weekdayIndex.set(n.toLowerCase(), i));
    names.weekdays.short.forEach((n, i) => weekdayIndex.set(n.toLowerCase(), i));
  }
  monthIndex.set('sept', 9);
  for (const [alias, i] of [['tues', 1], ['weds', 2], ['thur', 3], ['thurs', 3]] as const) weekdayIndex.set(alias, i);
  const alternation = (keys: Iterable<string>): string => [...keys].sort((a, b) => b.length - a.length).map(escape).join('|');
  const tables: NameTables = {
    months: new RegExp(`^(${alternation(monthIndex.keys())})\\.?(?!\\p{L})`, 'u'),
    monthIndex,
    weekdays: new RegExp(`^(${alternation(weekdayIndex.keys())})\\.?(?!\\p{L})`, 'u'),
    weekdayIndex,
  };
  tableCache.set(locale.names.language, tables);
  return tables;
}

const COUNT_WORDS: Readonly<Record<string, number>> = { a: 1, an: 1, one: 1 };
const count = (word: string): number => COUNT_WORDS[word] ?? Number(word);

/** A two-digit year, in the 100-year window centred on `now`'s year. */
function expandYear(yy: number, nowYear: number): number {
  const candidate = Math.floor(nowYear / 100) * 100 + yy;
  if (candidate < nowYear - 50) return candidate + 100;
  if (candidate >= nowYear + 50) return candidate - 100;
  return candidate;
}

/** Hours from a 12-hour clock: 12am is 0, 12pm is 12. Undefined for hours outside 1–12. */
function from12(h: number, meridiem: string): number | undefined {
  if (h < 1 || h > 12) return undefined;
  const pm = meridiem.startsWith('p');
  return h === 12 ? (pm ? 12 : 0) : pm ? h + 12 : h;
}

/**
 * Parses date and time text. Returns undefined when the text isn't a well-formed moment. `now` is
 * read only when the text needs it (relative input, a missing year), so `context` stays accurate.
 */
export function parseMoment(text: string, ctx: ResolvedCtx): Moment | undefined {
  const s = normalize(text).toLowerCase().trim();
  const names = nameTables(ctx.locale);
  const today = (): ReturnType<typeof parseNow> => parseNow(ctx.now());

  let date: CivilDate | undefined;
  let weekday: { readonly target: number; readonly which: string } | undefined;
  let dateFromNow = false;
  let time: CivilTime | undefined;
  let offset: string | undefined;
  let pos = 0;

  const setDate = (d: CivilDate): boolean => {
    if (date !== undefined || !isValidDate(d)) return false;
    date = d;
    return true;
  };
  const setTime = (t: CivilTime): boolean => {
    if (time !== undefined || !isValidTime(t)) return false;
    time = t;
    return true;
  };

  /** Resolves a numeric date's parts using the region's order; a month over 12 swaps with the day. */
  const numericDate = (a: number, b: number, year: number | undefined): CivilDate => {
    const order = ctx.locale.dateOrder;
    let [m, d] = order === 'DMY' || (order === 'YMD' && year !== undefined) ? [b, a] : [a, b];
    if (m > 12 && d <= 12) [m, d] = [d, m];
    return { y: year ?? today().date.y, m, d };
  };

  while (pos < s.length) {
    const rest = s.slice(pos);
    const skip = /^(?:[\s,]+|(?:at|on|the|of)(?!\p{L}))/u.exec(rest);
    if (skip) {
      pos += skip[0].length;
      continue;
    }
    let m: RegExpExecArray | null;

    // ISO date, optionally with a T time: 2026-10-02, 2026/10/02, 2026-10-02T15:00:00.123
    if ((m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:t(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(?![\d])/.exec(rest))) {
      if (!setDate({ y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) })) return undefined;
      if (m[4] !== undefined && !setTime({ h: Number(m[4]), mi: Number(m[5]), s: Number(m[6] ?? 0) })) return undefined;
      pos += m[0].length;
      continue;
    }

    // A UTC offset: Z, UTC, GMT, +02:00, -0400. Only after a date or time.
    if ((date || time) && (m = /^(z|utc|gmt|[+-]\d{2}:?\d{2})(?![\p{L}\d])/u.exec(rest))) {
      if (offset !== undefined) return undefined;
      offset = /^(utc|gmt)$/.test(m[1]!) ? '+00:00' : normalizeOffset(m[1]!);
      if (offset === undefined) return undefined;
      pos += m[0].length;
      continue;
    }

    // Time words.
    if ((m = /^(noon|midnight|now)(?!\p{L})/u.exec(rest))) {
      if (m[1] === 'now') {
        const now = today();
        if (!setTime(now.time)) return undefined;
        if (!setDate(now.date)) return undefined;
        dateFromNow = true;
      } else if (!setTime({ h: m[1] === 'noon' ? 12 : 0, mi: 0, s: 0 })) return undefined;
      pos += m[0].length;
      continue;
    }

    // A clock time: 3pm, 3:30 p.m., 15:00, 15:00:30. A bare number isn't a time.
    if ((m = /^(\d{1,2})(?::(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(a\.?m\.?|p\.?m\.?|a|p)?(?![\p{L}\d])/u.exec(rest)) && (m[2] !== undefined || m[4] !== undefined)) {
      let h: number | undefined = Number(m[1]);
      if (m[4] !== undefined) h = from12(h, m[4]);
      if (h === undefined || !setTime({ h, mi: Number(m[2] ?? 0), s: Number(m[3] ?? 0) })) return undefined;
      pos += m[0].length;
      continue;
    }

    // A numeric date: 10/2/2026, 2.10.26, 13/04.
    if ((m = /^(\d{1,2})([/.-])(\d{1,2})(?:\2(\d{4}|\d{2}))?(?![\d])/.exec(rest))) {
      const year = m[4] === undefined ? undefined : m[4].length === 4 ? Number(m[4]) : expandYear(Number(m[4]), today().date.y);
      if (!setDate(numericDate(Number(m[1]), Number(m[3]), year))) return undefined;
      pos += m[0].length;
      continue;
    }

    // Relative days.
    if ((m = /^(today|tomorrow|yesterday)(?!\p{L})/u.exec(rest))) {
      if (!setDate(addDays(today().date, m[1] === 'today' ? 0 : m[1] === 'tomorrow' ? 1 : -1))) return undefined;
      pos += m[0].length;
      continue;
    }
    if ((m = /^in (\d+|an?|one) (days?|weeks?)(?!\p{L})/u.exec(rest)) || (m = /^(\d+|an?|one) (days?|weeks?) ago(?!\p{L})/u.exec(rest))) {
      const n = count(m[1]!) * (m[2]!.startsWith('week') ? 7 : 1);
      if (!setDate(addDays(today().date, m[0].endsWith('ago') ? -n : n))) return undefined;
      pos += m[0].length;
      continue;
    }

    // A weekday: fri, this fri, next fri, last fri. Ignored if an explicit date is also written.
    const weekdayRest = /^(this |next |last )?/.exec(rest)![0];
    const weekdayMatch = names.weekdays.exec(rest.slice(weekdayRest.length));
    if (weekdayMatch) {
      if (weekday !== undefined) return undefined;
      weekday = { target: names.weekdayIndex.get(weekdayMatch[1]!)!, which: weekdayRest.trim() };
      pos += weekdayRest.length + weekdayMatch[0].length;
      continue;
    }

    // Month-name dates: Oct 2, October 2nd, 2026; 2 Oct 2026; the 2nd of October.
    const month = names.months.exec(rest);
    if (month && (m = /^\s*(\d{1,2})(?:st|nd|rd|th)?(?![\p{L}\d:])(?:,?\s*(\d{4})(?![\d:]))?/u.exec(rest.slice(month[0].length)))) {
      const y = m[2] === undefined ? today().date.y : Number(m[2]);
      if (!setDate({ y, m: names.monthIndex.get(month[1]!)!, d: Number(m[1]) })) return undefined;
      pos += month[0].length + m[0].length;
      continue;
    }
    if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?/u.exec(rest))) {
      const after = rest.slice(m[0].length);
      const monthAfter = names.months.exec(after);
      if (monthAfter) {
        const year = /^,?\s*(\d{4})(?![\d:])/.exec(after.slice(monthAfter[0].length));
        const y = year ? Number(year[1]) : today().date.y;
        if (!setDate({ y, m: names.monthIndex.get(monthAfter[1]!)!, d: Number(m[1]) })) return undefined;
        pos += m[0].length + monthAfter[0].length + (year ? year[0].length : 0);
        continue;
      }
    }

    return undefined;
  }

  // A weekday alone resolves against today; next to an explicit date it's ignored, and the clock isn't read.
  if (date === undefined && weekday !== undefined) {
    const now = today().date;
    const ahead = (weekday.target - weekdayOf(now) + 7) % 7;
    date = addDays(now, weekday.which === 'last' ? (ahead === 0 ? -7 : ahead - 7) : weekday.which === 'next' && ahead === 0 ? 7 : ahead);
  }
  if (date === undefined && time === undefined) return undefined;
  return { date, time, offset, dateFromNow };
}

/** The date `now` falls on, and its offset, for defaults. */
export const nowParts = (ctx: ResolvedCtx): ReturnType<typeof parseNow> => parseNow(ctx.now());
