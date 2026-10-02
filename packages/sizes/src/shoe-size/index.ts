import { defineCodec, formatNumber, type CodecOptions, type DefaultUnit, type Issue, type ParseOutcome, type Quantity, type ResolvedCtx } from 'quanto';
import { convert } from 'quanto/quantity';
import { baseOf, checkSize, distinct, resolveDefault, scan, SIZE_WORDS, unparseable, words, type SizeCodec, type SizeUnitDefinition } from '../size';

const INCH = 25.4;

/**
 * Adult shoe size systems, over the foot length in mm, the base.
 *
 * Each system defines its sizes on the last (the form the shoe is made on), which is longer than the
 * foot. The definitions are exact; the step from foot to last is an allowance, and this table uses the
 * common one of two size steps in each system (the "≈" formulas in Wikipedia's "Shoe size"):
 *
 * - `eu`: Paris points. Size = 1.5 × last length in cm, last = foot + 4/3 cm, so size = 1.5 × foot (cm) + 2.
 * - `uk`: size = 3 × last length in inches − 25, last = foot + 2/3 in, so size = 3 × foot (in) − 23.
 *   Men's and women's share it.
 * - `usMen`: size = 3 × foot (in) − 22, one size above UK (the Brannock device's scale).
 * - `usWomen`: US men's + 1.5, the common scale.
 * - `mm`: Mondopoint (ISO 9407), the foot length in mm.
 * - `cm`: the foot length in cm, as Japanese sizes are written.
 *
 * So US men's 10 is UK 9, EU 42.6 and 271 mm. Retail charts disagree with each other and with these,
 * usually putting EU about a size higher (US 10 as EU 44); conversions here follow the formulas, and
 * may be refined between releases.
 */
export const shoeSizeUnits: {
  readonly usMen: SizeUnitDefinition;
  readonly usWomen: SizeUnitDefinition;
  readonly uk: SizeUnitDefinition;
  readonly eu: SizeUnitDefinition;
  readonly mm: SizeUnitDefinition;
  readonly cm: SizeUnitDefinition;
} = {
  usMen: { toBase: { factor: INCH / 3, offset: (22 * INCH) / 3 }, step: 0.5, aliases: ['US M', "US men's", 'M', "men's"] },
  usWomen: { toBase: { factor: INCH / 3, offset: (20.5 * INCH) / 3 }, step: 0.5, aliases: ['US W', "US women's", 'W', "women's"] },
  uk: { toBase: { factor: INCH / 3, offset: (23 * INCH) / 3 }, step: 0.5, aliases: ['UK', 'GB', 'British', 'IE', 'AU', 'AUS', 'Australia', 'NZ'] },
  eu: { toBase: { factor: 20 / 3, offset: -40 / 3 }, step: 0.5, aliases: ['EU', 'EUR', 'Europe', 'European', 'FR'] },
  mm: { toBase: 1, step: 5, aliases: ['mm', 'Mondopoint', 'MP'] },
  cm: { toBase: 10, step: 0.5, aliases: ['cm', 'JP', 'Japan', 'Japanese'] },
};

export type ShoeSizeUnit = keyof typeof shoeSizeUnits;

export interface ShoeSizeOptions<C extends ShoeSizeUnit = ShoeSizeUnit> extends CodecOptions<Quantity<C>> {
  /**
   * Which US scale a size marked only `US` is (`US 10`): `mens` or `womens`. Without it, `US 10` is
   * `ambiguous`, with both readings as alternatives. Sizes marked men's or women's (`US M 10`, `W 8`)
   * don't need it.
   */
  readonly fit?: 'mens' | 'womens' | undefined;
  /**
   * What a bare number means (`10`, `size 10`): one system, or one per measurement system, like
   * `{ us: 'usMen', uk: 'uk', metric: 'eu' }`. Without it, a bare number is a `missing_unit` issue.
   */
  readonly defaultUnit?: DefaultUnit<ShoeSizeUnit> | undefined;
  /** Always convert the parsed size to this system: `mm` stores every size as a foot length. Narrows the value type. */
  readonly canonicalUnit?: C | undefined;
}

type System = 'us' | 'uk' | 'eu' | 'mm' | 'cm';
type Kind = System | 'men' | 'women' | 'kids' | 'size';

const MEN = ["men's", 'mens', 'men', 'male', 'gents'];
const WOMEN = ["women's", 'womens', 'women', 'female', 'ladies', "ladies'", "lady's"];
const KIDS = ['kids', "kids'", 'kid', "kid's", 'big kids', 'little kids', 'youth', 'toddler', 'toddlers', 'infant', 'infants', 'baby', 'child', "child's", 'children', "children's", 'junior', 'boys', "boys'", 'girls', "girls'"];
const SYSTEMS: ReadonlyArray<readonly [readonly string[], System]> = [
  [['US', 'USA', 'U.S.'], 'us'],
  [shoeSizeUnits.uk.aliases, 'uk'],
  [shoeSizeUnits.eu.aliases, 'eu'],
  [shoeSizeUnits.mm.aliases, 'mm'],
  [shoeSizeUnits.cm.aliases, 'cm'],
];
// `M` and `W` mark the fit only in front (`W 8`): after the size they're widths (`10 W` is wide).
// `C`, `Y`, `K` and `T` after a size are kids' scales (`5C`, `3Y`).
const BEFORE = words<Kind>([...SYSTEMS, [[...MEN, 'M'], 'men'], [[...WOMEN, 'W'], 'women'], [KIDS, 'kids'], [[...SIZE_WORDS, 'shoe', 'shoe size', 'pointure', 'Schuhgröße'], 'size']]);
const AFTER = words<Kind>([...SYSTEMS, [MEN, 'men'], [WOMEN, 'women'], [[...KIDS, 'C', 'Y', 'K', 'T'], 'kids']]);
const isSystem = (k: Kind): k is System => k === 'us' || k === 'uk' || k === 'eu' || k === 'mm' || k === 'cm';
const isFit = (k: Kind): k is 'men' | 'women' => k === 'men' || k === 'women';

const PREFIX: Readonly<Record<ShoeSizeUnit, string>> = { usMen: 'US M', usWomen: 'US W', uk: 'UK', eu: 'EU', mm: '', cm: '' };

/**
 * Adult shoe sizes: `US M 10`, `men's 10`, `W 8`, `UK 9`, `EU 44`, `44 EU`, `27 cm`, `JP 27`, `270 mm`.
 * A quantity over the foot length (`{ value: 10, unit: 'usMen' }`), so `convert`, `compare` and
 * `nearestSize` work.
 *
 * US men's and women's sizes differ, so a US size needs its fit: written (`men's`, `women's`, `M` or `W`
 * in front), or from the `fit` option; otherwise it's `ambiguous`. UK, EU and the lengths are unisex.
 * Kids' sizes (`5C`, `3Y`, `youth 3`) and widths (`10 D`, `10 W`) aren't read: they're `unknown_unit`.
 * Formats as `US M 10.5`, `US W 8`, `UK 9`, `EU 44`, `270 mm` or `27 cm`, to 2 decimals.
 */
export function shoeSize<C extends ShoeSizeUnit = ShoeSizeUnit>(options?: ShoeSizeOptions<C>): SizeCodec<ShoeSizeUnit, C> {
  const { defaultUnit, canonicalUnit, fit } = options ?? {};
  const defaults: Array<string | undefined> = typeof defaultUnit === 'object' ? Object.values(defaultUnit) : [defaultUnit];
  for (const unit of [canonicalUnit, ...defaults]) {
    if (unit !== undefined && !Object.hasOwn(shoeSizeUnits, unit)) {
      throw new Error(`@quantojs/sizes: shoeSize got the unit "${unit}", which isn't a shoe size system. Use one of: ${Object.keys(shoeSizeUnits).join(', ')}.`);
    }
  }
  if (fit !== undefined && fit !== 'mens' && fit !== 'womens') throw new Error(`@quantojs/sizes: shoeSize's fit must be "mens" or "womens"; got ${String(fit)}.`);
  const table = { id: 'shoeSize', units: shoeSizeUnits };

  /** A size as read, checked to be a real one and converted to `canonicalUnit`. */
  const finish = (q: Quantity<ShoeSizeUnit>): Quantity<C> | undefined => {
    if (q.value < 0 || !(baseOf(shoeSizeUnits[q.unit], q.value) > 0)) return undefined;
    return (canonicalUnit ? convert(table, q, canonicalUnit) : q) as Quantity<C>;
  };
  const notASize = (text: string) => unparseable(text, "That isn't a shoe size.");

  const parse = (text: string, ctx: ResolvedCtx): ParseOutcome<Quantity<C>> => {
    const read = scan(text, ctx, { before: BEFORE, after: AFTER });
    if (!read?.value) return unparseable(text);
    const all = [...read.before, ...read.after];
    if (all.includes('kids')) return { ok: false, issues: [{ code: 'unknown_unit', message: "Kids' sizes aren't supported. Enter an adult size, like \"US M 10\" or \"EU 44\"." }] };
    if (read.unknown !== undefined) return { ok: false, issues: [{ code: 'unknown_unit', message: `"${read.unknown}" isn't a shoe size system this field accepts. Use US, UK, EU, cm or mm.` }] };
    const systems = distinct(all, isSystem);
    const fits = distinct(all, isFit);
    if (systems.length > 1) return unparseable(text, 'Write one sizing system.');
    if (fits.length > 1) return unparseable(text, "Write men's or women's, not both.");
    const system = systems[0];
    const { value } = read.value;

    let unit: ShoeSizeUnit;
    if (system === 'us' || (system === undefined && fits.length === 1)) {
      const written = fits[0] ?? (fit === 'mens' ? 'men' : fit === 'womens' ? 'women' : undefined);
      if (written === undefined) {
        const readings = [finish({ value, unit: 'usMen' }), finish({ value, unit: 'usWomen' })];
        if (!readings[0] || !readings[1]) return notASize(text);
        const issue: Issue = { code: 'ambiguous', message: `US men's and women's sizes differ. Write which, like "US M ${formatNumber(value, ctx)}" or "US W ${formatNumber(value, ctx)}".` };
        return { ok: false, issues: [issue], alternatives: readings as Quantity<C>[] };
      }
      unit = written === 'men' ? 'usMen' : 'usWomen';
    } else if (system !== undefined) {
      // UK, EU and the lengths are unisex, so a fit written with them changes nothing.
      unit = system;
    } else {
      const resolved = resolveDefault(defaultUnit, ctx);
      if (resolved === undefined) return { ok: false, issues: [{ code: 'missing_unit', message: 'Add a sizing system, like "US M 10", "UK 9" or "EU 44".' }] };
      unit = resolved;
    }
    const size = finish({ value, unit });
    return size ? { ok: true, value: size } : notASize(text);
  };

  const format = (q: Quantity<C>, ctx: ResolvedCtx): string => {
    const n = formatNumber(q.value, ctx, { maxFractionDigits: 2 });
    return PREFIX[q.unit] ? `${PREFIX[q.unit]} ${n}` : `${n} ${q.unit}`;
  };

  const codec = defineCodec<Quantity<C>>({
    id: 'shoeSize',
    parse,
    format,
    check: (value) => checkSize(shoeSizeUnits, canonicalUnit, value, () => 0),
    options,
  });
  return { ...codec, units: shoeSizeUnits };
}
