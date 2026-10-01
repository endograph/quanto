import { defineExternalCodec, type CheckProblem, type CodecOptions, type ExternalCodec, type ExternalParseOutcome, type ResolvedCtx, type Signal } from 'quanto';
import { countryCode, countryName, isCountry } from './countries';
import { LOCALITY_ORDER, POSTAL_FORMATS, SUBDIVISIONS, SUBDIVISION_ALIASES } from './regions';
import { adjacent, fold, locate, type Located } from './text';

/**
 * A mailing address. Text is kept as it was typed (libpostal's lowercasing is undone); the region and
 * postal code are normalized where the country has a convention (`California` → `CA`, `sw1a2aa` →
 * `SW1A 2AA`), and the country is an ISO 3166-1 code. Absent parts are absent, not empty.
 */
export interface Address {
  /** The lines before the locality, in the order written: building, street, unit, PO box. At least one. */
  readonly lines: readonly string[];
  /** A suburb or neighbourhood written before the city (`Clifton` in Bristol). */
  readonly dependentLocality?: string;
  /** The city or town. */
  readonly locality?: string;
  /** The state, province or county: a code where the country has them (`CA`, `QC`, `NSW`). */
  readonly region?: string;
  readonly postalCode?: string;
  /** ISO 3166-1 alpha-2: `US`, `DE`. Absent when neither the text nor `defaultCountry` says. */
  readonly country?: string;
}

/**
 * One component of libpostal's parse: `{ label: 'road', value: 'amphitheatre pkwy' }`. libpostal's REST
 * services answer with `label`, node-postal with `component`; either works.
 */
export interface LibpostalComponent {
  readonly value: string;
  readonly label?: string | undefined;
  readonly component?: string | undefined;
}

/**
 * Runs libpostal's parser on the text: node-postal's `parser.parse_address`, or a request to a libpostal
 * service. Pass `init.signal` to whatever it calls. Reject when libpostal can't answer.
 */
export type Libpostal = (text: string, init: { readonly signal?: Signal | undefined }) => Promise<readonly LibpostalComponent[]>;

export interface AddressOptions extends CodecOptions<Address> {
  /** libpostal's parser. See `Libpostal`. */
  readonly libpostal: Libpostal;
  /**
   * The country of addresses that don't name one, as an ISO 3166-1 code: `US`. Formatting leaves it out
   * for the same reason. Without it, an address that names no country has none.
   */
  readonly defaultCountry?: string | undefined;
}

const unparseable = (message: string): ExternalParseOutcome<Address> => ({ ok: false, issues: [{ code: 'unparseable', message }] });

/** Which line a component belongs to. Components of one line are joined in the order written. */
const LINE_OF: Readonly<Record<string, string>> = {
  house: 'house',
  house_number: 'street',
  road: 'street',
  unit: 'unit',
  level: 'unit',
  staircase: 'unit',
  entrance: 'unit',
  po_box: 'po_box',
};

/** The region as the country writes it: a code where it has them, else as typed. */
function normalizeRegion(region: string, country: string | undefined): string {
  const names = country ? SUBDIVISIONS[country] : undefined;
  if (!names) return region;
  const folded = fold(region);
  for (const [code, name] of Object.entries(names)) if (folded === code.toLowerCase() || folded === fold(name)) return code;
  return SUBDIVISION_ALIASES[country!]?.[folded] ?? region;
}

/** The postal code in the country's format, when it has one and the code fits it; else as typed, uppercased. */
function normalizePostalCode(code: string, country: string | undefined): string {
  const compact = code.toUpperCase().replace(/[\s-]/g, '');
  for (const { pattern, format } of (country ? POSTAL_FORMATS[country] : undefined) ?? []) {
    if (pattern.test(compact)) return compact.replace(pattern, format);
  }
  return code.toUpperCase().replace(/\s+/g, ' ');
}

/** The lines, each joined from its components in the order written. */
function linesOf(text: string, parts: ReadonlyArray<{ readonly line: string; readonly at: Located }>): string[] {
  const groups = new Map<string, Located[]>();
  for (const { line, at } of parts) groups.set(line, [...(groups.get(line) ?? []), at]);
  return [...groups.values()]
    .map((spans) => spans.sort((a, b) => a.start - b.start))
    .sort((a, b) => a[0]!.start - b[0]!.start)
    .map((spans) =>
      spans.slice(1).reduce(
        // Parts written side by side keep the text between them (`Hauptstraße 5`); others join with a space.
        (line, span, i) => line + (adjacent(text, spans[i]!.end, span.start) ? text.slice(spans[i]!.end, span.start) : ' ') + span.text,
        spans[0]!.text,
      ),
    );
}

/** Reads libpostal's answer into an `Address`. */
function read(text: string, components: readonly LibpostalComponent[], defaultCountry: string | undefined): ExternalParseOutcome<Address> {
  const labels = components.map((c) => c.label ?? c.component);
  if (labels.some((label) => typeof label !== 'string') || components.some((c) => typeof c.value !== 'string')) {
    // A malformed reply is the service failing, not bad input: reject.
    throw new Error('quanto: @quantojs/libpostal got an answer from libpostal that isn\'t [{ label, value }].');
  }
  const located = locate(text, components.map((c) => c.value));
  const parts = located.map((at, i) => ({ label: labels[i]!, at }));
  const first = (...names: string[]): Located | undefined => names.map((name) => parts.find((p) => p.label === name)?.at).find(Boolean);

  const lines = linesOf(text, parts.flatMap(({ label, at }) => (LINE_OF[label] ? [{ line: LINE_OF[label]!, at }] : [])));
  if (lines.length === 0) return unparseable('Add a street address, like "1600 Amphitheatre Pkwy".');

  const writtenCountry = first('country');
  const named = writtenCountry ? countryCode(writtenCountry.text) : undefined;
  if (writtenCountry && !named) return unparseable(`Couldn't tell which country "${writtenCountry.text}" is.`);
  const country = named ?? defaultCountry;

  const locality = first('city', 'island')?.text;
  const dependent = first('suburb', 'city_district')?.text;
  const region = first('state')?.text;
  const postcode = first('postcode')?.text;
  if (!locality && !postcode) return unparseable('Add the city or postal code.');

  const address: Address = {
    lines,
    ...(dependent && dependent !== locality ? { dependentLocality: dependent } : {}),
    ...(locality ? { locality } : {}),
    ...(region ? { region: normalizeRegion(region, country) } : {}),
    ...(postcode ? { postalCode: normalizePostalCode(postcode, country) } : {}),
    ...(country ? { country } : {}),
  };
  return { ok: true, value: address };
}

const isText = (v: unknown): v is string => typeof v === 'string' && v !== '' && v.trim() === v;

function check(value: unknown): CheckProblem[] {
  const a = value as Partial<Record<keyof Address, unknown>> | null;
  if (typeof a !== 'object' || a === null) return [{ message: 'Expected an address: { lines, locality?, region?, postalCode?, country? }.' }];
  const problems: CheckProblem[] = [];
  if (!Array.isArray(a.lines) || a.lines.length === 0 || !a.lines.every(isText)) {
    problems.push({ message: 'Expected lines: at least one non-empty string, with no surrounding spaces.', path: ['lines'] });
  }
  for (const key of ['dependentLocality', 'locality', 'region', 'postalCode'] as const) {
    if (a[key] !== undefined && !isText(a[key])) problems.push({ message: 'Expected non-empty text with no surrounding spaces.', path: [key] });
  }
  if (a.country !== undefined && !(typeof a.country === 'string' && isCountry(a.country))) {
    problems.push({ message: 'Expected an ISO 3166-1 alpha-2 country code, like "US".', path: ['country'] });
  }
  return problems;
}

/** One line: `1600 Amphitheatre Pkwy, Mountain View, CA 94043`, in the country's order, naming the country unless it's the default. */
function format(address: Address, ctx: ResolvedCtx, defaultCountry: string | undefined): string {
  const { locality, region, postalCode, country } = address;
  const join = (separator: string, ...parts: Array<string | undefined>): string => parts.filter(Boolean).join(separator);
  const order = country ? LOCALITY_ORDER[country] : undefined;
  const place =
    order === 'postcode-first' ? join(' ', postalCode, locality, region)
    : order === 'city-postcode' ? join(' ', join(', ', locality, region), postalCode)
    : join(', ', locality, join(' ', region, postalCode));
  const named = country && country !== defaultCountry ? countryName(country, ctx.locale.language) : undefined;
  return join(', ', ...address.lines, address.dependentLocality, place, named);
}

/**
 * A mailing address, parsed by libpostal, which you run: node-postal in-process, or a libpostal service
 * (`pelias/libpostal-service`, say). @quantojs/libpostal reads libpostal's answer into an `Address`: it
 * restores the text as typed, normalizes regions and postal codes, and names the country by ISO code.
 *
 * libpostal splits an address into its parts; it doesn't check that the address exists. It has no
 * completions: those need an address index. The id is `address`.
 *
 *   address({ libpostal: async (text) => postal.parser.parse_address(text), defaultCountry: 'US' })
 */
export function address(options: AddressOptions): ExternalCodec<Address> {
  const { libpostal, defaultCountry } = options;
  if (typeof libpostal !== 'function') throw new Error('quanto: address() from @quantojs/libpostal needs a libpostal option: a function from text to libpostal\'s [{ label, value }].');
  if (defaultCountry !== undefined && !isCountry(defaultCountry)) {
    throw new Error(`quanto: address()'s defaultCountry "${defaultCountry}" isn't an ISO 3166-1 alpha-2 code. Use one like "US" or "DE".`);
  }
  return defineExternalCodec<Address>({
    id: 'address',
    parse: async (text, ctx) => read(text, await libpostal(text, { signal: ctx.signal }), defaultCountry),
    format: (value, ctx) => format(value, ctx, defaultCountry),
    check,
    options,
  });
}
