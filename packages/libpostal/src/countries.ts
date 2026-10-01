import { COUNTRY_NAMES, NAME_LANGUAGES } from './countries-data';
import { fold } from './text';

/** Names people write that ICU doesn't list. */
const ALIASES: Readonly<Record<string, string>> = {
  usa: 'US', america: 'US', 'united states of america': 'US',
  uk: 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  holland: 'NL', 'the netherlands': 'NL', 'czech republic': 'CZ', 'south korea': 'KR', 'republic of korea': 'KR',
  uae: 'AE', 'ivory coast': 'CI', 'russian federation': 'RU',
};

let byName: Map<string, string> | undefined;

/** Folded names and codes to ISO 3166-1 codes. Built on first use. */
function table(): Map<string, string> {
  if (byName) return byName;
  byName = new Map();
  for (const [code, names] of Object.entries(COUNTRY_NAMES)) {
    byName.set(code.toLowerCase(), code);
    for (const name of names) if (!byName.has(fold(name))) byName.set(fold(name), code);
  }
  for (const [name, code] of Object.entries(ALIASES)) byName.set(name, code);
  return byName;
}

/** The ISO 3166-1 code for a country as written (`Deutschland`, `USA`, `GB`), or undefined. */
export const countryCode = (written: string): string | undefined => table().get(fold(written));

/** Whether `code` is an ISO 3166-1 code quanto knows. */
export const isCountry = (code: string): boolean => code in COUNTRY_NAMES;

/** The country's name in `language`, or in English for languages without names. */
export function countryName(code: string, language: string): string {
  const names = COUNTRY_NAMES[code]!;
  const index = NAME_LANGUAGES.indexOf(language);
  return names[index < 0 ? 0 : index]!;
}
