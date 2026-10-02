import { defineCodec, type Codec, type CodecOptions, type ParseOutcome, type ResolvedCtx } from 'quanto';
import { getCountryCallingCode, isSupportedCountry, ParseError, parsePhoneNumberWithError, type CountryCode, type PhoneNumber } from 'libphonenumber-js/min';

/**
 * A phone number in E.164, `'+14155552671'`, with an extension as RFC 3966's `;ext=` suffix:
 * `'+14155552671;ext=123'`. Valid per libphonenumber-js's metadata when it was parsed; a stored value need
 * only be possible (the right length for its country), so a later metadata release can't make it unreadable.
 */
export type PhoneNumberValue = string;

/** Options for the phone number codec. */
export interface PhoneNumberOptions extends CodecOptions<PhoneNumberValue> {
  /**
   * The country of numbers written without a country code (`(415) 555-2671`), as an ISO 3166-1
   * alpha-2 code: `US`, `GB`. Without it, the locale's region. Numbers with `+` or an international
   * prefix (`00`, `011`) don't need one.
   */
  readonly defaultCountry?: string | undefined;
  /**
   * How `format` prints: `international` (`+1 415 555 2671`, the default) or `national`
   * (`(415) 555-2671`). National prints only numbers that read back in the field's country
   * (`defaultCountry`, else the locale's region); others print internationally, so the text always
   * parses back to the same number.
   */
  readonly style?: 'international' | 'national' | undefined;
}

const E164 = /^\+[1-9]\d{1,14}(?:;ext=\d{1,20})?$/;

/** The number as stored: E.164, and `;ext=` when there's an extension. */
const valueOf = (n: PhoneNumber): PhoneNumberValue => (n.ext ? `${n.number};ext=${n.ext}` : n.number);

/** A reading of the text, or libphonenumber-js's reason it has none (`NOT_A_NUMBER`, `INVALID_COUNTRY`, `TOO_SHORT`, …). */
function read(text: string, country: CountryCode | undefined): PhoneNumber | string {
  try {
    return parsePhoneNumberWithError(text, country ? { defaultCountry: country, extract: false } : { extract: false });
  } catch (error) {
    if (error instanceof ParseError) return error.message;
    throw error;
  }
}

/** The reading, if it's a valid number. */
const valid = (n: PhoneNumber | string | undefined): PhoneNumber | undefined => (typeof n === 'object' && n.isValid() ? n : undefined);

/**
 * The stored value as a `PhoneNumber`, or undefined when it isn't well-formed. Stored values need only be
 * possible, not valid: validity follows the metadata, which changes between releases, and a number stored
 * under one release must still display under the next.
 */
function fromValue(value: unknown): PhoneNumber | undefined {
  if (typeof value !== 'string' || !E164.test(value)) return undefined;
  const [number, ext] = value.split(';ext=') as [string, string | undefined];
  const parsed = read(number, undefined);
  const n = typeof parsed === 'object' && parsed.isPossible() ? parsed : undefined;
  if (!n || n.number !== number) return undefined;
  if (ext) n.setExt(ext);
  return n;
}

const unparseable = (message: string): ParseOutcome<never> => ({ ok: false, issues: [{ code: 'unparseable', message }] });

/**
 * Phone numbers, through libphonenumber-js: `+1 415 555 2671`, `(415) 555-2671` (in the field's
 * country), `0049 30 123456`, `tel:+1-415-555-2671`, with an extension (`ext. 123`, `x123`, `#123`).
 * Values are E.164 strings. Parsing requires a valid number per the metadata, not just the right length;
 * the structural check, which stored values go through, requires only the right length.
 * Formats as `+1 415 555 2671`, or nationally with `style: 'national'`.
 */
export function phoneNumber(options?: PhoneNumberOptions): Codec<PhoneNumberValue> {
  const defaultCountry = options?.defaultCountry;
  if (defaultCountry !== undefined && !isSupportedCountry(defaultCountry)) {
    throw new Error(`quanto: defaultCountry "${defaultCountry}" of the phoneNumber codec isn't a country libphonenumber-js knows. Use an uppercase ISO 3166-1 alpha-2 code such as "US".`);
  }
  const style = options?.style ?? 'international';
  if (style !== 'international' && style !== 'national') {
    throw new Error(`quanto: style "${String(style)}" of the phoneNumber codec isn't one of "international" or "national".`);
  }

  /** The country of national numbers: the option, else the locale's region if the metadata has it. */
  const countryOf = (ctx: ResolvedCtx): CountryCode | undefined =>
    defaultCountry ?? (isSupportedCountry(ctx.locale.region) ? ctx.locale.region : undefined);

  return defineCodec<PhoneNumberValue>({
    id: 'phoneNumber',
    options,
    parse(raw, ctx) {
      const text = raw.replace(/^tel: */i, '');
      const country = countryOf(ctx);
      const typed = read(text, country);
      // `00` is the international prefix in most of the world, so it reads as `+` where the country's own
      // prefix is another (`011` in the US) and the number doesn't read as typed.
      const plus = /^00/.test(text) && !valid(typed) ? valid(read(`+${text.slice(2)}`, country)) : undefined;
      const number = valid(typed) ?? plus;
      if (number) return { ok: true, value: valueOf(number) };

      if (typeof typed !== 'string') {
        const international = country === undefined || text.startsWith('+') || typed.countryCallingCode !== getCountryCallingCode(country);
        return unparseable(
          international
            ? `"${raw}" isn't a valid phone number for country code +${typed.countryCallingCode}.`
            : `"${raw}" isn't a valid phone number in ${country}. If it's from another country, start with + and the country code.`,
        );
      }
      if (typed === 'INVALID_COUNTRY') {
        return unparseable(
          /^\+/.test(text) ? `"${raw}" doesn't start with a known country code.` : `Add a country code to "${raw}", like "+44 20 7946 0958".`,
        );
      }
      if (typed === 'TOO_SHORT' || typed === 'TOO_LONG' || typed === 'INVALID_LENGTH') {
        const digits = typed === 'TOO_LONG' ? 'too many digits' : typed === 'TOO_SHORT' ? 'too few digits' : 'the wrong number of digits';
        return unparseable(`"${raw}" has ${digits} for a phone number.`);
      }
      return unparseable(`Couldn't understand "${raw}" as a phone number.`);
    },
    format(value, ctx) {
      const n = fromValue(value)!;
      const international = n.formatInternational();
      if (style === 'international') return international;
      const country = countryOf(ctx);
      if (country === undefined) return international;
      // Only text that reads back as this number in the field's country: a German number shown in the
      // US keeps its country code.
      const national = n.formatNational();
      const back = valid(read(national, country));
      return back && valueOf(back) === value ? national : international;
    },
    check: (value) =>
      fromValue(value)
        ? []
        : [{ message: 'Expected a phone number in E.164, like "+14155552671", with any extension as ";ext=123".' }],
  });
}
