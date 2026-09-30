// Generates src/locale/data.ts from the runtime's ICU data.
//
// quanto never reads Intl at runtime (DESIGN.md, Principle 8): the data is generated once, here,
// reviewed, and committed. Run with `bun scripts/generate-locale-data.ts`.
//
// Intl has no region → currency API, so that table is maintained by hand below (ISO 3166-1 → ISO 4217,
// as of 2026).

import { writeFileSync } from 'node:fs';

const REGION_CURRENCY: Record<string, string> = {
  AD: 'EUR', AE: 'AED', AF: 'AFN', AG: 'XCD', AI: 'XCD', AL: 'ALL', AM: 'AMD', AO: 'AOA', AQ: '',
  AR: 'ARS', AS: 'USD', AT: 'EUR', AU: 'AUD', AW: 'AWG', AX: 'EUR', AZ: 'AZN', BA: 'BAM', BB: 'BBD',
  BD: 'BDT', BE: 'EUR', BF: 'XOF', BG: 'EUR', BH: 'BHD', BI: 'BIF', BJ: 'XOF', BL: 'EUR', BM: 'BMD',
  BN: 'BND', BO: 'BOB', BQ: 'USD', BR: 'BRL', BS: 'BSD', BT: 'BTN', BV: 'NOK', BW: 'BWP', BY: 'BYN',
  BZ: 'BZD', CA: 'CAD', CC: 'AUD', CD: 'CDF', CF: 'XAF', CG: 'XAF', CH: 'CHF', CI: 'XOF', CK: 'NZD',
  CL: 'CLP', CM: 'XAF', CN: 'CNY', CO: 'COP', CR: 'CRC', CU: 'CUP', CV: 'CVE', CW: 'XCG', CX: 'AUD',
  CY: 'EUR', CZ: 'CZK', DE: 'EUR', DJ: 'DJF', DK: 'DKK', DM: 'XCD', DO: 'DOP', DZ: 'DZD', EC: 'USD',
  EE: 'EUR', EG: 'EGP', EH: 'MAD', ER: 'ERN', ES: 'EUR', ET: 'ETB', FI: 'EUR', FJ: 'FJD', FK: 'FKP',
  FM: 'USD', FO: 'DKK', FR: 'EUR', GA: 'XAF', GB: 'GBP', GD: 'XCD', GE: 'GEL', GF: 'EUR', GG: 'GBP',
  GH: 'GHS', GI: 'GIP', GL: 'DKK', GM: 'GMD', GN: 'GNF', GP: 'EUR', GQ: 'XAF', GR: 'EUR', GS: 'GBP',
  GT: 'GTQ', GU: 'USD', GW: 'XOF', GY: 'GYD', HK: 'HKD', HM: 'AUD', HN: 'HNL', HR: 'EUR', HT: 'HTG',
  HU: 'HUF', ID: 'IDR', IE: 'EUR', IL: 'ILS', IM: 'GBP', IN: 'INR', IO: 'USD', IQ: 'IQD', IR: 'IRR',
  IS: 'ISK', IT: 'EUR', JE: 'GBP', JM: 'JMD', JO: 'JOD', JP: 'JPY', KE: 'KES', KG: 'KGS', KH: 'KHR',
  KI: 'AUD', KM: 'KMF', KN: 'XCD', KP: 'KPW', KR: 'KRW', KW: 'KWD', KY: 'KYD', KZ: 'KZT', LA: 'LAK',
  LB: 'LBP', LC: 'XCD', LI: 'CHF', LK: 'LKR', LR: 'LRD', LS: 'LSL', LT: 'EUR', LU: 'EUR', LV: 'EUR',
  LY: 'LYD', MA: 'MAD', MC: 'EUR', MD: 'MDL', ME: 'EUR', MF: 'EUR', MG: 'MGA', MH: 'USD', MK: 'MKD',
  ML: 'XOF', MM: 'MMK', MN: 'MNT', MO: 'MOP', MP: 'USD', MQ: 'EUR', MR: 'MRU', MS: 'XCD', MT: 'EUR',
  MU: 'MUR', MV: 'MVR', MW: 'MWK', MX: 'MXN', MY: 'MYR', MZ: 'MZN', NA: 'NAD', NC: 'XPF', NE: 'XOF',
  NF: 'AUD', NG: 'NGN', NI: 'NIO', NL: 'EUR', NO: 'NOK', NP: 'NPR', NR: 'AUD', NU: 'NZD', NZ: 'NZD',
  OM: 'OMR', PA: 'PAB', PE: 'PEN', PF: 'XPF', PG: 'PGK', PH: 'PHP', PK: 'PKR', PL: 'PLN', PM: 'EUR',
  PN: 'NZD', PR: 'USD', PS: 'ILS', PT: 'EUR', PW: 'USD', PY: 'PYG', QA: 'QAR', RE: 'EUR', RO: 'RON',
  RS: 'RSD', RU: 'RUB', RW: 'RWF', SA: 'SAR', SB: 'SBD', SC: 'SCR', SD: 'SDG', SE: 'SEK', SG: 'SGD',
  SH: 'SHP', SI: 'EUR', SJ: 'NOK', SK: 'EUR', SL: 'SLE', SM: 'EUR', SN: 'XOF', SO: 'SOS', SR: 'SRD',
  SS: 'SSP', ST: 'STN', SV: 'USD', SX: 'XCG', SY: 'SYP', SZ: 'SZL', TC: 'USD', TD: 'XAF', TF: 'EUR',
  TG: 'XOF', TH: 'THB', TJ: 'TJS', TK: 'NZD', TL: 'USD', TM: 'TMT', TN: 'TND', TO: 'TOP', TR: 'TRY',
  TT: 'TTD', TV: 'AUD', TW: 'TWD', TZ: 'TZS', UA: 'UAH', UG: 'UGX', UM: 'USD', US: 'USD', UY: 'UYU',
  UZ: 'UZS', VA: 'EUR', VC: 'XCD', VE: 'VES', VG: 'USD', VI: 'USD', VN: 'VND', VU: 'VUV', WF: 'XPF',
  WS: 'WST', XK: 'EUR', YE: 'YER', YT: 'EUR', ZA: 'ZAR', ZM: 'ZMW', ZW: 'ZWG',
};

// Languages whose likely region is bundled, for tags without a region ('de' → DE).
const LANGUAGES = `af am ar as az be bg bn bs ca cs cy da de el en es et eu fa fi fil fr ga gl gu ha he
  hi hr hu hy id ig is it ja ka kk km kn ko ky lb lo lt lv mi mk ml mn mr ms mt my nb ne nl nn no or pa pl
  ps pt ro ru rw si sk sl so sq sr sv sw ta te th tk tr uk ur uz vi xh yo zh zu`.split(/\s+/);

// Real language-region combinations whose conventions can differ from their region's default.
// Only those that actually differ are emitted.
const EXCEPTION_CANDIDATES = `en-CA fr-CA de-CH fr-CH it-CH rm-CH nl-BE fr-BE de-BE fr-LU de-LU lb-LU
  en-IN hi-IN bn-IN ta-IN te-IN mr-IN gu-IN kn-IN ml-IN en-ZA af-ZA zu-ZA xh-ZA es-US en-PR ca-ES eu-ES
  gl-ES en-SG zh-SG ms-SG ta-SG en-HK zh-HK en-MO zh-MO pt-MO en-MY ms-MY zh-MY en-PH fil-PH sv-FI fi-FI en-IE
  ga-IE en-MT mt-MT en-NZ mi-NZ en-PK ur-PK en-KE sw-KE fr-MA ar-MA fr-DZ ar-DZ fr-TN ar-TN ar-IL
  he-IL ru-UA uk-UA ru-KZ kk-KZ ru-BY be-BY sv-AX en-IL en-CM fr-CM en-RW fr-RW en-AE ar-AE en-DE
  en-NL en-SE en-DK en-FI en-AT en-CH en-BE en-NG en-GH`.split(/\s+/);

type Conventions = { order: string; decimal: string; group: string; secondary: number; minGrouping: number };

// Normalize separator characters the way quanto's `normalize` does, so parsing and data agree.
const normalizeSeparator = (c: string): string =>
  /[     ]/.test(c) ? ' ' : /[’ʼ']/.test(c) ? "'" : c;

function conventions(tag: string): Conventions {
  const nf = new Intl.NumberFormat(`${tag}-u-nu-latn`);
  const parts = nf.formatToParts(12345678.5);
  const decimal = normalizeSeparator(parts.find((p) => p.type === 'decimal')!.value);
  const groupPart = parts.find((p) => p.type === 'group');
  const group = normalizeSeparator(groupPart?.value ?? ',');
  const integers = parts.filter((p) => p.type === 'integer').map((p) => p.value.length);
  const secondary = integers.length >= 3 ? integers[integers.length - 2]! : 3;
  const minGrouping = nf.formatToParts(1234).some((p) => p.type === 'group') ? 1 : 2;
  const df = new Intl.DateTimeFormat(`${tag}-u-ca-gregory-nu-latn`, { year: 'numeric', month: 'numeric', day: 'numeric' });
  const order = df
    .formatToParts(new Date(2026, 2, 4))
    .filter((p) => p.type === 'year' || p.type === 'month' || p.type === 'day')
    .map((p) => p.type[0]!.toUpperCase())
    .join('');
  return { order, decimal, group, secondary, minGrouping };
}

const key = (c: Conventions): string => JSON.stringify([c.order, c.decimal, c.group, c.secondary, c.minGrouping]);

const regionDefaults = new Map<string, Conventions>();
const regionLines: string[] = [];
for (const [region, currency] of Object.entries(REGION_CURRENCY).sort(([a], [b]) => a.localeCompare(b))) {
  const language = new Intl.Locale(`und-${region}`).maximize().language;
  const c = conventions(`${language}-${region}`);
  regionDefaults.set(region, c);
  regionLines.push(`  ${region}: [${JSON.stringify(currency)}, ${key(c).slice(1, -1)}],`);
}

const exceptionLines: string[] = [];
for (const tag of EXCEPTION_CANDIDATES.sort()) {
  const region = tag.split('-')[1]!;
  const base = regionDefaults.get(region);
  if (!base) throw new Error(`Exception candidate ${tag} has no region data`);
  const c = conventions(tag);
  if (key(c) !== key(base)) exceptionLines.push(`  '${tag}': [${key(c).slice(1, -1)}],`);
}

const likelyLines: string[] = [];
for (const language of LANGUAGES.sort()) {
  const region = new Intl.Locale(language).maximize().region;
  if (region && REGION_CURRENCY[region] !== undefined) likelyLines.push(`  ${language}: '${region}',`);
}

const out = `// Generated by scripts/generate-locale-data.ts. Do not edit by hand.
// Source: the ICU data of the generating runtime, plus a hand-maintained region → currency table.

/** [dateOrder, decimal, group, secondaryGroupSize, minimumGroupingDigits] */
export type ConventionsRow = readonly [string, string, string, number, number];

/** Per region: [currency ('' if none), ...ConventionsRow] */
export const REGIONS: Readonly<Record<string, readonly [string, string, string, string, number, number]>> = {
${regionLines.join('\n')}
};

/** Language-region combinations whose conventions differ from their region's default. */
export const EXCEPTIONS: Readonly<Record<string, ConventionsRow>> = {
${exceptionLines.join('\n')}
};

/** The likely region for a tag that has only a language. */
export const LIKELY_REGIONS: Readonly<Record<string, string>> = {
${likelyLines.join('\n')}
};
`;

writeFileSync(new URL('../src/locale/data.ts', import.meta.url), out);
console.log(`regions: ${regionLines.length}, exceptions: ${exceptionLines.length}, languages: ${likelyLines.length}`);
