// Default formatting for dates and times, from bundled data only (DESIGN.md, Formatting). Every form
// here reads back through the grammar under the same ctx.

import type { ResolvedCtx } from 'quanto';
import { type CivilDate, type CivilTime, isoDate } from './civil';
import { dateOrder, hourCycle } from './locale';
import { en, monthAbbreviation, type Names } from './names';

/**
 * `Oct 2, 2026` (MDY regions), `2 Oct 2026` (DMY), `2026-10-02` (YMD). Never a numeric day/month order.
 * Month names come from the codec's name set for the locale's language, or English.
 */
export function formatDate(date: CivilDate, ctx: ResolvedCtx, names: readonly Names[] = []): string {
  const order = dateOrder(ctx.locale);
  if (order === 'YMD') return isoDate(date);
  const month = monthAbbreviation(names.find((n) => n.language === ctx.locale.language) ?? en, date.m);
  const year = String(date.y).padStart(4, '0');
  return order === 'MDY' ? `${month} ${date.d}, ${year}` : `${date.d} ${month} ${year}`;
}

/**
 * Two dates in one year, sharing it: `Oct 3–5, 2026` and `Oct 30 – Nov 2, 2026` (MDY), `3–5 Oct 2026`
 * and `30 Oct – 2 Nov 2026` (DMY). Undefined for anything else (YMD regions, two years, one day, a
 * backwards range), which keeps the full `start – end`. The range rules read each form back.
 */
export function formatDateSpan(start: CivilDate, end: CivilDate, ctx: ResolvedCtx, names: readonly Names[] = []): string | undefined {
  const order = dateOrder(ctx.locale);
  if (order === 'YMD' || start.y !== end.y || isoDate(start) >= isoDate(end)) return undefined;
  const set = names.find((n) => n.language === ctx.locale.language) ?? en;
  const [sm, em] = [monthAbbreviation(set, start.m), monthAbbreviation(set, end.m)];
  const year = String(start.y).padStart(4, '0');
  if (start.m === end.m) return order === 'MDY' ? `${sm} ${start.d}–${end.d}, ${year}` : `${start.d}–${end.d} ${sm} ${year}`;
  return order === 'MDY' ? `${sm} ${start.d} – ${em} ${end.d}, ${year}` : `${start.d} ${sm} – ${end.d} ${em} ${year}`;
}

/** `3:00 PM` or `15:00`, by the region's hour cycle. Seconds only when they aren't zero. */
export function formatTime(time: CivilTime, ctx: ResolvedCtx): string {
  const mm = String(time.mi).padStart(2, '0');
  const ss = time.s === 0 ? '' : `:${String(time.s).padStart(2, '0')}`;
  if (hourCycle(ctx.locale) === 24) return `${String(time.h).padStart(2, '0')}:${mm}${ss}`;
  const h12 = time.h % 12 === 0 ? 12 : time.h % 12;
  return `${h12}:${mm}${ss} ${time.h < 12 ? 'AM' : 'PM'}`;
}

/** `Oct 2, 2026, 3:00 PM`, or `2026-10-02 15:00` in YMD regions. */
export function formatDateTime(date: CivilDate, time: CivilTime, ctx: ResolvedCtx, names: readonly Names[] = []): string {
  const day = formatDate(date, ctx, names);
  return dateOrder(ctx.locale) === 'YMD' ? `${day} ${formatTime(time, ctx)}` : `${day}, ${formatTime(time, ctx)}`;
}
