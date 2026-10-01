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
