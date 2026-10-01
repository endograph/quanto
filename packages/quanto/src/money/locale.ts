import { lookupRegional, type Locale } from '../locale';
import { REGION_CURRENCY, SYMBOL_POSITION, SYMBOL_POSITION_EXCEPTIONS } from './regions';

/** The currency of the locale's region (ISO 4217), if it has one. */
export const regionCurrency = (locale: Locale): string | undefined => lookupRegional(locale, REGION_CURRENCY);

/** Where the locale writes a currency symbol: `$12.34` (prefix) or `12,34 €` (suffix). */
export const symbolPosition = (locale: Locale): 'prefix' | 'suffix' =>
  lookupRegional(locale, SYMBOL_POSITION, SYMBOL_POSITION_EXCEPTIONS) ?? 'prefix';
