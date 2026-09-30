// Bundled currency data (DESIGN.md, Money). Intl is never consulted: unknown codes make it throw, and
// small-ICU builds report wrong digits.

/** Active ISO 4217 codes (as of 2026), plus recently withdrawn ones that stored data may still use. */
const CODES = `AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP
  BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP
  GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD
  KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK
  NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN
  SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XCD
  XCG XOF XPF YER ZAR ZMW ZWG`.split(/\s+/);

/** ISO 4217 minor-unit exceptions; every other known code has two decimals. */
const MINOR_DIGITS: Readonly<Record<string, number>> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0,
  VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  CLF: 4, UYW: 4,
};

const KNOWN = new Set(CODES);

export const isKnownCurrency = (code: string): boolean => KNOWN.has(code);

/** Decimal places of a known currency's minor unit. */
export const minorDigits = (code: string): number => MINOR_DIGITS[code] ?? 2;

const DOLLARS = ['USD', 'CAD', 'AUD', 'NZD', 'MXN', 'SGD', 'HKD', 'TWD', 'ARS', 'CLP', 'COP', 'CUP', 'DOP', 'UYU', 'BSD', 'BBD', 'BZD', 'BMD', 'BND', 'FJD', 'GYD', 'JMD', 'KYD', 'LRD', 'NAD', 'SBD', 'SRD', 'TTD', 'XCD'];
const PESOS = ['MXN', 'ARS', 'CLP', 'COP', 'PHP', 'UYU', 'DOP', 'CUP'];
const RUPEES = ['INR', 'PKR', 'LKR', 'NPR'];

/**
 * Symbols and names people type, lowercased, mapped to the currencies they can mean. When there's
 * more than one, resolution picks `defaultCurrency`, then the locale's currency, if either is listed,
 * and the first one otherwise.
 */
export const CURRENCY_TOKENS: Readonly<Record<string, readonly string[]>> = {
  $: DOLLARS,
  'us$': ['USD'], 'c$': ['CAD', 'NIO'], 'ca$': ['CAD'], 'a$': ['AUD'], 'au$': ['AUD'], 'nz$': ['NZD'],
  'hk$': ['HKD'], 's$': ['SGD'], 'mx$': ['MXN'], 'nt$': ['TWD'], 'r$': ['BRL'],
  '€': ['EUR'], '£': ['GBP', 'GIP', 'FKP', 'SHP'], 'e£': ['EGP'],
  '¥': ['JPY', 'CNY'], 'jp¥': ['JPY'], 'cn¥': ['CNY'], '円': ['JPY'], '元': ['CNY'],
  '₹': ['INR'], rs: RUPEES, '₨': ['PKR', 'INR', 'LKR', 'NPR'], '₩': ['KRW'], '₽': ['RUB'], '₺': ['TRY'],
  '₪': ['ILS'], '₫': ['VND'], '₱': ['PHP'], '฿': ['THB'], '₴': ['UAH'], '₦': ['NGN'], '₸': ['KZT'],
  '₾': ['GEL'], '৳': ['BDT'], 'zł': ['PLN'], 'kč': ['CZK'], ft: ['HUF'], kr: ['SEK', 'NOK', 'DKK', 'ISK'],
  r: ['ZAR'], rm: ['MYR'], rp: ['IDR'], lei: ['RON'], 's/': ['PEN'],
  dollar: DOLLARS, dollars: DOLLARS, buck: DOLLARS, bucks: DOLLARS,
  euro: ['EUR'], euros: ['EUR'], pound: ['GBP'], pounds: ['GBP'], quid: ['GBP'],
  yen: ['JPY'], yuan: ['CNY'], rmb: ['CNY'], rupee: RUPEES, rupees: RUPEES, peso: PESOS, pesos: PESOS,
};

/** The symbol `format` tries for a currency; currencies without one print their ISO code. */
export const DISPLAY_SYMBOLS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(DOLLARS.map((c) => [c, '$'])),
  EUR: '€', GBP: '£', GIP: '£', FKP: '£', SHP: '£', JPY: '¥', CNY: '¥', INR: '₹', PKR: 'Rs', KRW: '₩',
  RUB: '₽', TRY: '₺', ILS: '₪', VND: '₫', PHP: '₱', THB: '฿', UAH: '₴', NGN: '₦', KZT: '₸', GEL: '₾',
  BDT: '৳', PLN: 'zł', CZK: 'Kč', HUF: 'Ft', SEK: 'kr', NOK: 'kr', DKK: 'kr', ISK: 'kr', ZAR: 'R',
  MYR: 'RM', IDR: 'Rp', RON: 'lei', BRL: 'R$', PEN: 'S/',
};

/** Picks one currency from a token's candidates. */
export function resolveCandidates(candidates: readonly string[], defaultCurrency: string | undefined, localeCurrency: string | undefined): string {
  if (defaultCurrency !== undefined && candidates.includes(defaultCurrency)) return defaultCurrency;
  if (localeCurrency !== undefined && candidates.includes(localeCurrency)) return localeCurrency;
  return candidates[0]!;
}
