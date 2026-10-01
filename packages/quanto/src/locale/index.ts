import { EXCEPTIONS, LIKELY_REGIONS, REGIONS } from './data';

export type MeasurementSystem = 'us' | 'uk' | 'metric';

/**
 * A resolved locale: the language and region a tag stands for, and the conventions every codec needs.
 * Domain data (currencies, date order, month names, …) belongs to its domain (`quanto/money`,
 * `@quanto/datetime`), which looks it up by `region` and `language`. See DESIGN.md, Locales.
 */
export interface Locale {
  /** The canonicalized tag, as recorded in `context.locale`. */
  readonly tag: string;
  /** The tag's language subtag (`de` for `de-CH`). */
  readonly language: string;
  /** The region the data was resolved for: the tag's own, or its language's likely region. */
  readonly region: string;
  /** Normalized decimal separator: `.` or `,`. */
  readonly decimal: string;
  /** Normalized grouping separator: `,`, `.`, `' '` or `'`. */
  readonly group: string;
  /** Size of the groups after the first (3, or 2 for Indian-style grouping). The first group is always 3. */
  readonly secondaryGroupSize: number;
  /** Digits needed above the first group before grouping applies (1: `1,234`; 2: `1234` but `12.345`). */
  readonly minimumGroupingDigits: number;
  readonly measurementSystem: MeasurementSystem;
}

const cache = new Map<string, Locale>();

/** Canonicalizes a BCP 47 tag to `language[-Script][-REGION]`. Throws on a malformed tag. */
export function canonicalizeTag(tag: string): string {
  const parts = tag.trim().split(/[-_]/);
  const language = parts[0]?.toLowerCase() ?? '';
  if (!/^[a-z]{2,3}$/.test(language)) {
    throw new Error(`quanto: "${tag}" is not a valid BCP 47 locale tag. Pass a tag such as "en-US" or "de", or omit ctx.locale to use en-US.`);
  }
  let out = language;
  let i = 1;
  const script = parts[i];
  if (script && /^[a-z]{4}$/i.test(script)) {
    out += `-${script[0]!.toUpperCase()}${script.slice(1).toLowerCase()}`;
    i++;
  }
  const region = parts[i];
  if (region && /^([a-z]{2}|\d{3})$/i.test(region)) out += `-${region.toUpperCase()}`;
  return out;
}

/**
 * Looks up a row in region-keyed data with language exceptions: the `language-region` row if there is
 * one, otherwise the region's. Domains and custom codecs use it for their own tables, so every codec
 * resolves a locale the same way.
 */
export function lookupRegional<Row>(locale: Locale, regions: Readonly<Record<string, Row>>, exceptions?: Readonly<Record<string, Row>>): Row | undefined {
  return exceptions?.[`${locale.language}-${locale.region}`] ?? regions[locale.region];
}

/** Resolves a (canonicalized or raw) tag to its bundled locale data. */
export function resolveLocale(tag: string): Locale {
  const canonical = canonicalizeTag(tag);
  const cached = cache.get(canonical);
  if (cached) return cached;

  const [language] = canonical.split('-') as [string];
  const tagRegion = canonical.split('-').find((p) => /^[A-Z]{2}$/.test(p));
  const region = tagRegion && REGIONS[tagRegion] ? tagRegion : (LIKELY_REGIONS[language] ?? 'US');
  const [decimal, group, secondary, minGrouping] = EXCEPTIONS[`${language}-${region}`] ?? REGIONS[region]!;

  const locale: Locale = {
    tag: canonical,
    language,
    region,
    decimal,
    group,
    secondaryGroupSize: secondary,
    minimumGroupingDigits: minGrouping,
    measurementSystem: region === 'US' ? 'us' : region === 'GB' ? 'uk' : 'metric',
  };
  cache.set(canonical, locale);
  return locale;
}
