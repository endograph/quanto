import { lookupRegional, type Locale } from 'quanto';
import { NAMES, type Names } from './names';
import { CALENDAR, CALENDAR_EXCEPTIONS } from './regions';

export type DateOrder = 'MDY' | 'DMY' | 'YMD';

const row = (locale: Locale) => lookupRegional(locale, CALENDAR, CALENDAR_EXCEPTIONS) ?? (['MDY', 12] as const);

/** The locale's numeric date order (`03/04/2026` is March 4 in MDY regions). */
export const dateOrder = (locale: Locale): DateOrder => row(locale)[0];

/** The locale's clock: 12 (3:00 PM) or 24 (15:00). */
export const hourCycle = (locale: Locale): 12 | 24 => row(locale)[1];

/** Month and weekday names for display: the locale's language, or English when it isn't bundled. */
export const displayNames = (locale: Locale): Names => NAMES[locale.language] ?? NAMES.en!;

/** Names accepted when parsing: the language's, then English, which every locale accepts. */
export const acceptedNames = (locale: Locale): readonly Names[] =>
  NAMES[locale.language] && locale.language !== 'en' ? [NAMES[locale.language]!, NAMES.en!] : [NAMES.en!];
