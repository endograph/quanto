// Default formatting for dates and times, from bundled data only (DESIGN.md, Formatting). Every form
// here reads back through the grammar under the same ctx.

import type { ResolvedCtx } from '../../core/types';
import { type CivilDate, type CivilTime, isoDate } from './civil';

/** `Oct 2, 2026` (MDY regions), `2 Oct 2026` (DMY), `2026-10-02` (YMD). Never a numeric day/month order. */
export function formatDate(date: CivilDate, ctx: ResolvedCtx): string {
  const { dateOrder, names } = ctx.locale;
  if (dateOrder === 'YMD') return isoDate(date);
  const month = names.months.short[date.m - 1]!;
  const year = String(date.y).padStart(4, '0');
  return dateOrder === 'MDY' ? `${month} ${date.d}, ${year}` : `${date.d} ${month} ${year}`;
}

/** `3:00 PM` or `15:00`, by the region's hour cycle. Seconds only when they aren't zero. */
export function formatTime(time: CivilTime, ctx: ResolvedCtx): string {
  const mm = String(time.mi).padStart(2, '0');
  const ss = time.s === 0 ? '' : `:${String(time.s).padStart(2, '0')}`;
  if (ctx.locale.hourCycle === 24) return `${String(time.h).padStart(2, '0')}:${mm}${ss}`;
  const h12 = time.h % 12 === 0 ? 12 : time.h % 12;
  return `${h12}:${mm}${ss} ${time.h < 12 ? 'AM' : 'PM'}`;
}

/** `Oct 2, 2026, 3:00 PM`, or `2026-10-02 15:00` in YMD regions. */
export function formatDateTime(date: CivilDate, time: CivilTime, ctx: ResolvedCtx): string {
  return ctx.locale.dateOrder === 'YMD' ? `${formatDate(date, ctx)} ${formatTime(time, ctx)}` : `${formatDate(date, ctx)}, ${formatTime(time, ctx)}`;
}
