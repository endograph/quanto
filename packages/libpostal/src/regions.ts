// Per-country data the codec normalizes with: subdivision codes for the countries whose addresses
// conventionally abbreviate them, and postal code formats. Written by hand, from ISO 3166-2 and the
// national postal services' published formats.

/** Subdivision names (and their codes) to codes, for countries that write the code: `California` → `CA`. */
export const SUBDIVISIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  US: {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
    DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
    IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
    NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
    RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
    VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
    AS: 'American Samoa', GU: 'Guam', MP: 'Northern Mariana Islands', PR: 'Puerto Rico', VI: 'U.S. Virgin Islands',
  },
  CA: {
    AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador',
    NS: 'Nova Scotia', NT: 'Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island',
    QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon',
  },
  AU: {
    ACT: 'Australian Capital Territory', NSW: 'New South Wales', NT: 'Northern Territory', QLD: 'Queensland',
    SA: 'South Australia', TAS: 'Tasmania', VIC: 'Victoria', WA: 'Western Australia',
  },
};

/** Other names people write for a subdivision, by country: French names in Canada, `Calif.`. */
export const SUBDIVISION_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  US: { 'washington dc': 'DC', 'washington d c': 'DC', calif: 'CA', 'virgin islands': 'VI' },
  CA: {
    'colombie britannique': 'BC', 'nouveau brunswick': 'NB', 'terre neuve et labrador': 'NL', 'nouvelle ecosse': 'NS',
    'territoires du nord ouest': 'NT', 'ile du prince edouard': 'PE', 'pq': 'QC',
  },
  AU: {},
};

/**
 * A postal code format: the code with spaces and hyphens removed, uppercased, must match `pattern`, and is
 * written as `format` (with `$1`, `$2` for its groups).
 */
interface PostalFormat {
  readonly pattern: RegExp;
  readonly format: string;
}

const digits = (n: number): PostalFormat => ({ pattern: new RegExp(`^(\\d{${n}})$`), format: '$1' });

/** Postal code formats for countries with one fixed format. Elsewhere a code is kept as written. */
export const POSTAL_FORMATS: Readonly<Record<string, readonly PostalFormat[]>> = {
  US: [{ pattern: /^(\d{5})(\d{4})$/, format: '$1-$2' }, digits(5)],
  CA: [{ pattern: /^([A-Z]\d[A-Z])(\d[A-Z]\d)$/, format: '$1 $2' }],
  GB: [{ pattern: /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/, format: '$1 $2' }],
  IE: [{ pattern: /^([AC-FHKNPRTV-Y]\d[\dW])([AC-FHKNPRTV-Y\d]{4})$/, format: '$1 $2' }],
  NL: [{ pattern: /^(\d{4})([A-Z]{2})$/, format: '$1 $2' }],
  PL: [{ pattern: /^(\d{2})(\d{3})$/, format: '$1-$2' }],
  PT: [{ pattern: /^(\d{4})(\d{3})$/, format: '$1-$2' }],
  BR: [{ pattern: /^(\d{5})(\d{3})$/, format: '$1-$2' }],
  JP: [{ pattern: /^(\d{3})(\d{4})$/, format: '$1-$2' }],
  SE: [{ pattern: /^(\d{3})(\d{2})$/, format: '$1 $2' }],
  CZ: [{ pattern: /^(\d{3})(\d{2})$/, format: '$1 $2' }],
  SK: [{ pattern: /^(\d{3})(\d{2})$/, format: '$1 $2' }],
  DE: [digits(5)], FR: [digits(5)], IT: [digits(5)], ES: [digits(5)], FI: [digits(5)], MX: [digits(5)],
  AT: [digits(4)], BE: [digits(4)], CH: [digits(4)], DK: [digits(4)], NO: [digits(4)], AU: [digits(4)],
  NZ: [digits(4)], ZA: [digits(4)], HU: [digits(4)], IN: [digits(6)],
};

/**
 * How each country orders the line with the city: `city region postcode` (US), `postcode city` (most of
 * Europe) or `city postcode` (UK). Countries not listed use the first.
 */
export const LOCALITY_ORDER: Readonly<Record<string, 'postcode-first' | 'city-postcode'>> = {
  DE: 'postcode-first', FR: 'postcode-first', IT: 'postcode-first', ES: 'postcode-first', NL: 'postcode-first',
  BE: 'postcode-first', CH: 'postcode-first', AT: 'postcode-first', DK: 'postcode-first', NO: 'postcode-first',
  SE: 'postcode-first', FI: 'postcode-first', PL: 'postcode-first', PT: 'postcode-first', CZ: 'postcode-first',
  SK: 'postcode-first', HU: 'postcode-first', LU: 'postcode-first', IS: 'postcode-first', GR: 'postcode-first',
  GB: 'city-postcode', IE: 'city-postcode', JE: 'city-postcode', GG: 'city-postcode', IM: 'city-postcode',
};
