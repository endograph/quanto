import { defineCodec, type Codec, type CodecOptions, type ParseOutcome, type ResolvedCtx } from 'quanto';
import { isoDate, isoTime, normalizeOffset, parseIsoDate, parseIsoTime } from './civil';
import { formatDate, formatDateTime, formatTime } from './format';
import { type Moment, nowParts, parseMoment } from './grammar';

type Problems = Array<{ message: string }>;

/** Which of the four codecs a codec is, so `dateRange` can pick its rules. Codecs made here only. */
export type CalendarKind = 'date' | 'time' | 'localDateTime' | 'dateTime';

const kinds = new WeakMap<object, CalendarKind>();

/** The calendar kind of a codec made by `date()`, `time()`, `localDateTime()` or `dateTime()`. */
export const calendarKindOf = (codec: object): CalendarKind | undefined => kinds.get(codec);

const register = (kind: CalendarKind, codec: Codec<string>): Codec<string> => {
  kinds.set(codec, kind);
  return codec;
};

const unparseable = <T>(text: string, hint: string): ParseOutcome<T> => ({
  ok: false,
  issues: [{ code: 'unparseable', message: `Couldn't understand "${text}" as ${hint}.` }],
});

/** Splits `YYYY-MM-DDTHH:MM:SS[±HH:MM]` into checked parts. */
function splitDateTime(value: unknown, withOffset: boolean) {
  if (typeof value !== 'string') return undefined;
  const m = withOffset ? /^(.{10})T(.{8})([+-]\d{2}:\d{2})$/.exec(value) : /^(.{10})T(.{8})$/.exec(value);
  if (!m) return undefined;
  const date = parseIsoDate(m[1]!);
  const time = parseIsoTime(m[2]!);
  const offset = m[3] === undefined ? undefined : normalizeOffset(m[3]);
  if (!date || !time || (withOffset && offset !== m[3])) return undefined;
  return { date, time, offset };
}

/**
 * A calendar date, stored as `YYYY-MM-DD`: `2026-10-02`, `Oct 2`, `2/10/2026`, `tomorrow`, `next fri`,
 * `in 3 days`. Numeric dates follow the region's order.
 */
export function date(options?: CodecOptions<string>): Codec<string> {
  const parse = (text: string, ctx: ResolvedCtx): ParseOutcome<string> => {
    const moment = parseMoment(text, ctx);
    if (!moment?.date || moment.time || moment.offset) return unparseable(text, 'a date');
    return { ok: true, value: isoDate(moment.date) };
  };
  return register('date', defineCodec<string>({
    id: 'date',
    parse,
    format: (value, ctx) => formatDate(parseIsoDate(value)!, ctx),
    check: (value): Problems => (typeof value === 'string' && parseIsoDate(value) ? [] : [{ message: 'Expected a date as YYYY-MM-DD.' }]),
    options,
  }));
}

/** A wall-clock time, stored as `HH:MM:SS`: `3pm`, `3:30 p.m.`, `15:00`, `noon`. */
export function time(options?: CodecOptions<string>): Codec<string> {
  const parse = (text: string, ctx: ResolvedCtx): ParseOutcome<string> => {
    const moment = parseMoment(text, ctx);
    if (!moment?.time || (moment.date && !moment.dateFromNow) || moment.offset) return unparseable(text, 'a time');
    return { ok: true, value: isoTime(moment.time) };
  };
  return register('time', defineCodec<string>({
    id: 'time',
    parse,
    format: (value, ctx) => formatTime(parseIsoTime(value)!, ctx),
    check: (value): Problems => (typeof value === 'string' && parseIsoTime(value) ? [] : [{ message: 'Expected a time as HH:MM:SS.' }]),
    options,
  }));
}

/** Fills in today's date for a time-only moment. */
const withDate = (moment: Moment, ctx: ResolvedCtx) => (moment.date ? moment.date : nowParts(ctx).date);

/**
 * A date and time with no offset, stored as `YYYY-MM-DDTHH:MM:SS`: `tomorrow 3pm`, `Oct 2 at 15:00`.
 * A time alone is today; a date alone is unparseable (add a time).
 */
export function localDateTime(options?: CodecOptions<string>): Codec<string> {
  const parse = (text: string, ctx: ResolvedCtx): ParseOutcome<string> => {
    const moment = parseMoment(text, ctx);
    if (!moment?.time || moment.offset) return unparseable(text, 'a date and time');
    return { ok: true, value: `${isoDate(withDate(moment, ctx))}T${isoTime(moment.time)}` };
  };
  return register('localDateTime', defineCodec<string>({
    id: 'localDateTime',
    parse,
    format: (value, ctx) => {
      const parts = splitDateTime(value, false)!;
      return formatDateTime(parts.date, parts.time, ctx);
    },
    check: (value): Problems => (splitDateTime(value, false) ? [] : [{ message: 'Expected a date and time as YYYY-MM-DDTHH:MM:SS.' }]),
    options,
  }));
}

/**
 * An exact moment with the UTC offset it was entered in, stored as `YYYY-MM-DDTHH:MM:SS±HH:MM`.
 * Without a written offset, the offset of `now` is used. Time zone names aren't supported.
 */
export function dateTime(options?: CodecOptions<string>): Codec<string> {
  const parse = (text: string, ctx: ResolvedCtx): ParseOutcome<string> => {
    const moment = parseMoment(text, ctx);
    if (!moment?.time) return unparseable(text, 'a date and time');
    const offset = moment.offset ?? nowParts(ctx).offset;
    return { ok: true, value: `${isoDate(withDate(moment, ctx))}T${isoTime(moment.time)}${offset}` };
  };
  return register('dateTime', defineCodec<string>({
    id: 'dateTime',
    parse,
    format: (value, ctx) => {
      const parts = splitDateTime(value, true)!;
      return `${formatDateTime(parts.date, parts.time, ctx)} ${parts.offset}`;
    },
    check: (value): Problems => (splitDateTime(value, true) ? [] : [{ message: 'Expected a date and time with offset as YYYY-MM-DDTHH:MM:SS±HH:MM.' }]),
    options,
  }));
}
