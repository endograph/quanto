import { defineCodec, formatNumber, type CodecOptions, type DefaultUnit, type ParseOutcome, type Quantity, type ResolvedCtx } from 'quanto';
import { convert } from 'quanto/quantity';
import { baseOf, checkSize, distinct, resolveDefault, scan, SIZE_WORDS, unparseable, words, type SizeCodec, type SizeUnitDefinition } from '../size';

/**
 * Ring size systems, over the ring's inner circumference in mm (ISO 8653:2016), the base:
 *
 * - `us`: US and Canada. Inner diameter = 0.458 in + 0.032 in per size, so 11.6332 mm + 0.8128 mm × size;
 *   quarter sizes are standard.
 * - `uk`: UK, Ireland, Australia and New Zealand (BS 6820:1987): letters with half sizes, 1.25 mm of
 *   circumference per letter, C being 40 mm. The value is the letter's place in the alphabet (A is 1,
 *   N is 14, N½ 14.5), and past Z it goes on: Z+1 is 27.
 * - `eu`: ISO 8653 and continental Europe: the circumference in mm.
 * - `ch`: Switzerland, Italy and Spain: the circumference less 40 mm.
 * - `diameter`: the inner diameter in mm.
 *
 * All of these are defined exactly, so they convert exactly. Japanese sizes are left out: they have no
 * defining formula, and the published tables disagree.
 */
export const ringSizeUnits: {
  readonly us: SizeUnitDefinition;
  readonly uk: SizeUnitDefinition;
  readonly eu: SizeUnitDefinition;
  readonly ch: SizeUnitDefinition;
  readonly diameter: SizeUnitDefinition;
} = {
  us: { toBase: { factor: 0.8128 * Math.PI, offset: 11.6332 * Math.PI }, step: 0.25, aliases: ['US', 'USA', 'U.S.', 'CA', 'Canada', 'Canadian'] },
  uk: { toBase: { factor: 1.25, offset: 36.25 }, step: 0.5, aliases: ['UK', 'GB', 'British', 'IE', 'Ireland', 'AU', 'AUS', 'Australia', 'Australian', 'NZ'] },
  eu: { toBase: 1, step: 1, aliases: ['EU', 'ISO', 'Europe', 'European', 'circumference', 'circ'] },
  ch: { toBase: { factor: 1, offset: 40 }, step: 1, aliases: ['CH', 'Swiss', 'Switzerland', 'IT', 'Italy', 'Italian', 'ES', 'Spain', 'Spanish'] },
  diameter: { toBase: Math.PI, step: 0.1, aliases: ['diameter', 'dia', 'inner diameter', 'ID', 'Ø'] },
};

export type RingSizeUnit = keyof typeof ringSizeUnits;

export interface RingSizeOptions<C extends RingSizeUnit = RingSizeUnit> extends CodecOptions<Quantity<C>> {
  /**
   * What a bare number means (`7`, `size 7`): one system, or one per measurement system, like
   * `{ us: 'us', uk: 'eu', metric: 'eu' }`. Without it, a bare number is a `missing_unit` issue. Not
   * `uk`: UK sizes are letters, which always mean UK.
   */
  readonly defaultUnit?: DefaultUnit<Exclude<RingSizeUnit, 'uk'>> | undefined;
  /** Always convert the parsed size to this system: `eu` stores every size as a circumference. Narrows the value type. */
  readonly canonicalUnit?: C | undefined;
}

type Kind = RingSizeUnit | 'size' | 'mm';

const SYSTEMS = Object.entries(ringSizeUnits).map(([unit, def]) => [def.aliases, unit as RingSizeUnit] as const);
const BEFORE = words<Kind>([...SYSTEMS, [[...SIZE_WORDS, 'ring', 'ring size'], 'size']]);
const AFTER = words<Kind>([...SYSTEMS, [['mm'], 'mm']]);
const isSystem = (k: Kind): k is RingSizeUnit => k !== 'size' && k !== 'mm';

/** A UK letter size: `N`, `N½` (`N1/2`, `N 1/2` once normalized), and past Z, `Z+1`. */
const LETTER = /^([a-z])(?: ?\+ ?(\d+))?(?: ?(1\/2))?(?![\p{L}\p{N}])/iu;

function readLetter(s: string, from: number): { value: number; end: number } | null | undefined {
  const m = LETTER.exec(s.slice(from));
  if (!m) return undefined;
  const letter = m[1]!.toUpperCase();
  // Only Z goes on: N+1 isn't a size.
  if (m[2] !== undefined && letter !== 'Z') return null;
  const value = letter.charCodeAt(0) - 64 + (m[2] === undefined ? 0 : Number(m[2])) + (m[3] ? 0.5 : 0);
  return { value, end: from + m[0].length };
}

/** A UK size to the nearest half: `N`, `N½`, `Z+1`. */
function formatLetter(value: number): string {
  const halves = Math.round(value * 2);
  const whole = Math.floor(halves / 2);
  const letter = whole <= 26 ? String.fromCharCode(64 + whole) : `Z+${whole - 26}`;
  return `${letter}${halves % 2 ? '½' : ''}`;
}

/** The smallest value of each system that `format` prints: UK starts at A, which a value from 0.75 rounds to. */
const minOf = (unit: string): number => (unit === 'uk' ? 0.75 : 0);


/**
 * Ring sizes: `US 7`, `7½`, `N½`, `UK N`, `Z+1`, `EU 54`, `54 mm`, `17.3 mm diameter`, `CH 14`. A quantity
 * over the inner circumference (`{ value: 7, unit: 'us' }`), so `convert`, `compare` and `nearestSize` work.
 *
 * The system can come before or after the size, with `size` or `ring size` in front. Letters are UK
 * sizes wherever they're typed. `54 mm` is the circumference, as ISO 8653 defines ring sizes, with the
 * diameter as an alternative. Formats as `US 7.25`, `UK N½`, `EU 54`, `CH 14` or `17.3 mm diameter`;
 * UK sizes print to the nearest half letter, everything else to 2 decimals.
 */
export function ringSize<C extends RingSizeUnit = RingSizeUnit>(options?: RingSizeOptions<C>): SizeCodec<RingSizeUnit, C> {
  const { defaultUnit, canonicalUnit } = options ?? {};
  const defaults: Array<string | undefined> = typeof defaultUnit === 'object' ? Object.values(defaultUnit) : [defaultUnit];
  for (const unit of [canonicalUnit, ...defaults]) {
    if (unit !== undefined && !Object.hasOwn(ringSizeUnits, unit)) {
      throw new Error(`@quantojs/sizes: ringSize got the unit "${unit}", which isn't a ring size system. Use one of: ${Object.keys(ringSizeUnits).join(', ')}.`);
    }
  }
  if (defaults.includes('uk')) {
    throw new Error('@quantojs/sizes: ringSize\'s defaultUnit can\'t be "uk": UK ring sizes are letters, which always mean UK. Default bare numbers to another system.');
  }
  const table = { id: 'ringSize', units: ringSizeUnits };

  /** A size as read, checked to be a real one and converted to `canonicalUnit`. */
  const finish = (q: Quantity<RingSizeUnit>): Quantity<C> | undefined => {
    if (q.value < 0 || !(baseOf(ringSizeUnits[q.unit], q.value) > 0)) return undefined;
    return (canonicalUnit ? convert(table, q, canonicalUnit) : q) as Quantity<C>;
  };

  const parse = (text: string, ctx: ResolvedCtx): ParseOutcome<Quantity<C>> => {
    const read = scan(text, ctx, { before: BEFORE, after: AFTER, letter: readLetter });
    if (!read?.value) return unparseable(text);
    if (read.unknown !== undefined) return { ok: false, issues: [{ code: 'unknown_unit', message: `"${read.unknown}" isn't a ring size system this field accepts. Use US, UK, EU or mm.` }] };
    const all = [...read.before, ...read.after];
    const systems = distinct(all, isSystem);
    if (systems.length > 1) return unparseable(text, 'Write one sizing system.');
    const system = systems[0];
    const mm = all.includes('mm');
    const { value, letter } = read.value;

    let q: Quantity<RingSizeUnit>;
    let alternative: Quantity<RingSizeUnit> | undefined;
    if (letter) {
      if ((system !== undefined && system !== 'uk') || mm) return unparseable(text, 'Letter sizes are UK sizes, like "UK N½".');
      q = { value, unit: 'uk' };
    } else if (system === 'uk') {
      return unparseable(text, 'UK ring sizes are letters, like "UK N½".');
    } else if (mm && system !== undefined && system !== 'eu' && system !== 'diameter') {
      return unparseable(text, `${ringSizeUnits[system].aliases[0]} sizes aren't in mm.`);
    } else if (system !== undefined) {
      q = { value, unit: system };
    } else if (mm) {
      // ISO 8653 sizes are circumferences in mm; a diameter is the other reading.
      q = { value, unit: 'eu' };
      alternative = { value, unit: 'diameter' };
    } else {
      const unit = resolveDefault(defaultUnit, ctx);
      if (unit === undefined) return { ok: false, issues: [{ code: 'missing_unit', message: 'Add a sizing system, like "US 7", "UK N" or "EU 54".' }] };
      q = { value, unit };
    }
    const size = finish(q);
    if (!size) return unparseable(text, "That isn't a ring size.");
    const alt = alternative && finish(alternative);
    return alt ? { ok: true, value: size, alternatives: [alt] } : { ok: true, value: size };
  };

  const format = (q: Quantity<C>, ctx: ResolvedCtx): string => {
    if (q.unit === 'uk') return `UK ${formatLetter(q.value)}`;
    const n = formatNumber(q.value, ctx, { maxFractionDigits: 2 });
    return q.unit === 'diameter' ? `${n} mm diameter` : `${ringSizeUnits[q.unit].aliases[0]} ${n}`;
  };

  const codec = defineCodec<Quantity<C>>({
    id: 'ringSize',
    parse,
    format,
    check: (value) => checkSize(ringSizeUnits, canonicalUnit, value, minOf),
    options,
  });
  return { ...codec, units: ringSizeUnits };
}
