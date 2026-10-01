import { defineCodec, type Codec, type CodecOptions, type ParseOutcome, type ResolvedCtx } from 'quanto';
import { isoDate, isoTime, normalizeOffset, parseIsoDate, parseIsoTime } from './civil';
import { formatDate, formatDateSpan, formatDateTime, formatTime } from './format';
import { buildNameTables, type Moment, nowParts, parseMoment } from './grammar';
import { assertNames, type Names } from './names';

type Problems = Array<{ message: string }>;

/** Options for `date()`, `localDateTime()` and `dateTime()`. */
export interface DateOptions extends CodecOptions<string> {
  /**
   * Month and weekday names to accept besides English, in order of priority: `[de]`, `[es, fr]`, or your
   * own `Names`. `format` uses the set matching the locale's language.
   */
  readonly names?: readonly Names[] | undefined;
}

/** The name tables for a codec, checking each set once, when the codec is created. */
const tablesFor = (names: readonly Names[] | undefined) => {
  for (const set of names ?? []) assertNames(set);
  return buildNameTables(names ?? []);
};

const userOptions = (options: DateOptions | undefined): CodecOptions<string> => ({ schema: options?.schema, format: options?.format });

/** Which of the four codecs a codec is, so `dateRange` can pick its rules. Codecs made here only. */
export type CalendarKind = 'date' | 'time' | 'localDateTime' | 'dateTime';

const kinds = new WeakMap<object, CalendarKind>();

/** The calendar kind of a codec made by `date()`, `time()`, `localDateTime()` or `dateTime()`. */
export const calendarKindOf = (codec: object): CalendarKind | undefined => kinds.get(codec);

/** The shorter range format of a `date()` that formats by default, for `dateRange`. */
export type SpanFormat = (start: string, end: string, ctx: ResolvedCtx) => string | undefined;

const spans = new WeakMap<object, SpanFormat>();

/** The span format of a codec made by `date()` without a `format` option. */
export const spanFormatOf = (codec: object): SpanFormat | undefined => spans.get(codec);

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
export function date(options?: DateOptions): Codec<string> {
  const names = options?.names ?? [];
  const tables = tablesFor(names);
  const parse = (text: string, ctx: ResolvedCtx): ParseOutcome<string> => {
    const moment = parseMoment(text, ctx, tables);
    if (!moment?.date || moment.time || moment.offset) return unparseable(text, 'a date');
    return { ok: true, value: isoDate(moment.date) };
  };
  const codec = register('date', defineCodec<string>({
    id: 'date',
    parse,
    format: (value, ctx) => formatDate(parseIsoDate(value)!, ctx, names),
    check: (value): Problems => (typeof value === 'string' && parseIsoDate(value) ? [] : [{ message: 'Expected a date as YYYY-MM-DD.' }]),
    options: userOptions(options),
  }));
  // A user's format has its own look, which a shortened range wouldn't match.
  if (!options?.format) spans.set(codec, (start, end, ctx) => formatDateSpan(parseIsoDate(start)!, parseIsoDate(end)!, ctx, names));
  return codec;
}

/** A wall-clock time, stored as `HH:MM:SS`: `3pm`, `3:30 p.m.`, `15:00`, `noon`. */
export function time(options?: CodecOptions<string>): Codec<string> {
  const tables = tablesFor([]);
  const parse = (text: string, ctx: ResolvedCtx): ParseOutcome<string> => {
    const moment = parseMoment(text, ctx, tables);
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
export function localDateTime(options?: DateOptions): Codec<string> {
  const names = options?.names ?? [];
  const tables = tablesFor(names);
  const parse = (text: string, ctx: ResolvedCtx): ParseOutcome<string> => {
    const moment = parseMoment(text, ctx, tables);
    if (!moment?.time || moment.offset) return unparseable(text, 'a date and time');
    return { ok: true, value: `${isoDate(withDate(moment, ctx))}T${isoTime(moment.time)}` };
  };
  return register('localDateTime', defineCodec<string>({
    id: 'localDateTime',
    parse,
    format: (value, ctx) => {
      const parts = splitDateTime(value, false)!;
      return formatDateTime(parts.date, parts.time, ctx, names);
    },
    check: (value): Problems => (splitDateTime(value, false) ? [] : [{ message: 'Expected a date and time as YYYY-MM-DDTHH:MM:SS.' }]),
    options: userOptions(options),
  }));
}

/**
 * An exact moment with the UTC offset it was entered in, stored as `YYYY-MM-DDTHH:MM:SS±HH:MM`.
 * Without a written offset, the offset of `now` is used. Time zone names aren't supported.
 */
export function dateTime(options?: DateOptions): Codec<string> {
  const names = options?.names ?? [];
  const tables = tablesFor(names);
  const parse = (text: string, ctx: ResolvedCtx): ParseOutcome<string> => {
    const moment = parseMoment(text, ctx, tables);
    if (!moment?.time) return unparseable(text, 'a date and time');
    const offset = moment.offset ?? nowParts(ctx).offset;
    return { ok: true, value: `${isoDate(withDate(moment, ctx))}T${isoTime(moment.time)}${offset}` };
  };
  return register('dateTime', defineCodec<string>({
    id: 'dateTime',
    parse,
    format: (value, ctx) => {
      const parts = splitDateTime(value, true)!;
      return `${formatDateTime(parts.date, parts.time, ctx, names)} ${parts.offset}`;
    },
    check: (value): Problems => (splitDateTime(value, true) ? [] : [{ message: 'Expected a date and time with offset as YYYY-MM-DDTHH:MM:SS±HH:MM.' }]),
    options: userOptions(options),
  }));
}
