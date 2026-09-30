// Civil-calendar arithmetic on plain integers (proleptic Gregorian). No Date, no time zones: `now`
// already carries its local wall time and offset, and relative input only needs day arithmetic.

export interface CivilDate {
  readonly y: number;
  readonly m: number;
  readonly d: number;
}

export interface CivilTime {
  readonly h: number;
  readonly mi: number;
  readonly s: number;
}

export const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export const daysInMonth = (y: number, m: number): number =>
  m === 2 ? (isLeapYear(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;

export const isValidDate = ({ y, m, d }: CivilDate): boolean =>
  Number.isInteger(y) && y >= 1 && y <= 9999 && m >= 1 && m <= 12 && Number.isInteger(d) && d >= 1 && d <= daysInMonth(y, m);

export const isValidTime = ({ h, mi, s }: CivilTime): boolean => h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s <= 59;

/** Days since 1970-01-01 (Howard Hinnant's days_from_civil). */
export function daysFromCivil({ y, m, d }: CivilDate): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The civil date `days` days after 1970-01-01. */
export function civilFromDays(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: era * 400 + yoe + (m <= 2 ? 1 : 0), m, d };
}

export const addDays = (date: CivilDate, n: number): CivilDate => civilFromDays(daysFromCivil(date) + n);

/** 0 = Monday … 6 = Sunday. 1970-01-01 was a Thursday. */
export const weekdayOf = (date: CivilDate): number => (((daysFromCivil(date) + 3) % 7) + 7) % 7;

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

export const isoDate = ({ y, m, d }: CivilDate): string => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
export const isoTime = ({ h, mi, s }: CivilTime): string => `${pad(h)}:${pad(mi)}:${pad(s)}`;

/** Parses `YYYY-MM-DD`; undefined if malformed or not a real date. */
export function parseIsoDate(text: string): CivilDate | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return undefined;
  const date = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  return isValidDate(date) ? date : undefined;
}

/** Parses `HH:MM:SS`; undefined if malformed or out of range. */
export function parseIsoTime(text: string): CivilTime | undefined {
  const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (!m) return undefined;
  const time = { h: Number(m[1]), mi: Number(m[2]), s: Number(m[3]) };
  return isValidTime(time) ? time : undefined;
}

/** Normalizes a UTC offset (`Z`, `+0200`, `+02:00`) to `±HH:MM`; undefined if out of range. */
export function normalizeOffset(offset: string): string | undefined {
  if (/^z$/i.test(offset)) return '+00:00';
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset);
  if (!m || Number(m[2]) > 18 || Number(m[3]) > 59) return undefined;
  return `${m[1]}${m[2]}:${m[3]}`;
}

/** The local date, time and offset of an RFC 3339 `now`. Fractional seconds are dropped. */
export function parseNow(now: string): { date: CivilDate; time: CivilTime; offset: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.exec(now)!;
  return {
    date: { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) },
    time: { h: Number(m[4]), mi: Number(m[5]), s: Number(m[6]) },
    offset: normalizeOffset(m[7]!)!,
  };
}

/**
 * Moves the date part of an ISO date, local date-time or date-time value forward by a day or a year,
 * keeping the rest. Undefined if the result isn't a real date (Feb 29 plus a year).
 */
export function rollIso(value: string, by: 'day' | 'year'): string | undefined {
  const date = parseIsoDate(value.slice(0, 10));
  if (!date) return undefined;
  const next = by === 'day' ? addDays(date, 1) : { ...date, y: date.y + 1 };
  return isValidDate(next) ? isoDate(next) + value.slice(10) : undefined;
}

/** Seconds since 1970-01-01T00:00:00Z of a `YYYY-MM-DDTHH:MM:SS±HH:MM` value, for ordering. */
export function instantSeconds(value: string): number | undefined {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})([+-])(\d{2}):(\d{2})$/.exec(value);
  const date = m && parseIsoDate(m[1]!);
  if (!m || !date) return undefined;
  const offset = (m[5] === '-' ? -1 : 1) * (Number(m[6]) * 3600 + Number(m[7]) * 60);
  return daysFromCivil(date) * 86400 + Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]) - offset;
}
