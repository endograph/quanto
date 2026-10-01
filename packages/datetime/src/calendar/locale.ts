import { lookupRegional, type Locale } from 'quanto';
import { CALENDAR, CALENDAR_EXCEPTIONS } from './regions';

export type DateOrder = 'MDY' | 'DMY' | 'YMD';

const row = (locale: Locale) => lookupRegional(locale, CALENDAR, CALENDAR_EXCEPTIONS) ?? (['MDY', 12] as const);

/** The locale's numeric date order (`03/04/2026` is March 4 in MDY regions). */
export const dateOrder = (locale: Locale): DateOrder => row(locale)[0];

/** The locale's clock: 12 (3:00 PM) or 24 (15:00). */
export const hourCycle = (locale: Locale): 12 | 24 => row(locale)[1];
