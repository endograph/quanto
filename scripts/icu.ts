// Shared helpers for the packages' locale-data generators (dev only, never shipped). Each package
// generates the per-region data it owns from the runtime's ICU data: quanto its number conventions and
// (for @quantojs/common/money) currencies, @quantojs/datetime date order, clocks and names. See DESIGN.md, Locales.

/** Every ISO 3166-1 region quanto knows. */
export const REGION_CODES: readonly string[] = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN
  BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE
  EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU
  ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
  MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM
  PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS
  ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS
  XK YE YT ZA ZM ZW`.split(/\s+/);

// Languages whose likely region is bundled, for tags without a region ('de' → DE).
export const LANGUAGES: readonly string[] = `af am ar as az be bg bn bs ca cs cy da de el en es et eu fa fi fil fr ga gl gu ha he
  hi hr hu hy id ig is it ja ka kk km kn ko ky lb lo lt lv mi mk ml mn mr ms mt my nb ne nl nn no or pa pl
  ps pt ro ru rw si sk sl so sq sr sv sw ta te th tk tr uk ur uz vi xh yo zh zu`.split(/\s+/);

// Real language-region combinations whose conventions can differ from their region's default.
// Only those that actually differ are emitted.
export const EXCEPTION_CANDIDATES: readonly string[] = `en-CA fr-CA de-CH fr-CH it-CH rm-CH nl-BE fr-BE de-BE fr-LU de-LU lb-LU
  en-IN hi-IN bn-IN ta-IN te-IN mr-IN gu-IN kn-IN ml-IN en-ZA af-ZA zu-ZA xh-ZA es-US en-PR ca-ES eu-ES
  gl-ES en-SG zh-SG ms-SG ta-SG en-HK zh-HK en-MO zh-MO pt-MO en-MY ms-MY zh-MY en-PH fil-PH sv-FI fi-FI en-IE
  ga-IE en-MT mt-MT en-NZ mi-NZ en-PK ur-PK en-KE sw-KE fr-MA ar-MA fr-DZ ar-DZ fr-TN ar-TN ar-IL
  he-IL ru-UA uk-UA ru-KZ kk-KZ ru-BY be-BY sv-AX en-IL en-CM fr-CM en-RW fr-RW en-AE ar-AE en-DE
  en-NL en-SE en-DK en-FI en-AT en-CH en-BE en-NG en-GH`.split(/\s+/);

// Normalize separator characters the way quanto's `normalize` does, so parsing and data agree.
export const normalizeSeparator = (c: string): string =>
  /[     ]/.test(c) ? ' ' : /[’ʼ']/.test(c) ? "'" : c;

/** The language a region's own conventions come from (`und-CH` → `de`). */
export const likelyLanguage = (region: string): string => new Intl.Locale(`und-${region}`).maximize().language;

/**
 * Computes a row for every region (from its likely language) and, for the exception candidates, the
 * rows that differ from their region's. Rows are compared as JSON.
 */
export function regionTable<Row>(compute: (tag: string) => Row): { regions: Array<[string, Row]>; exceptions: Array<[string, Row]> } {
  const regions = [...REGION_CODES].sort().map((region): [string, Row] => [region, compute(`${likelyLanguage(region)}-${region}`)]);
  const byRegion = new Map(regions);
  const exceptions: Array<[string, Row]> = [];
  for (const tag of [...EXCEPTION_CANDIDATES].sort()) {
    const base = byRegion.get(tag.split('-')[1]!);
    if (base === undefined) throw new Error(`Exception candidate ${tag} has no region`);
    const row = compute(tag);
    if (JSON.stringify(row) !== JSON.stringify(base)) exceptions.push([tag, row]);
  }
  return { regions, exceptions };
}

/** Renders `[key, row]` pairs as object-literal lines. */
export const lines = (pairs: Array<[string, unknown]>): string =>
  pairs.map(([k, v]) => `  ${/^[A-Za-z]+$/.test(k) ? k : `'${k}'`}: ${JSON.stringify(v)},`).join('\n');
