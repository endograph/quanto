import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/** Length units. Base unit: the meter. */
export const lengthUnits: {
  readonly um: UnitDefinition;
  readonly mm: UnitDefinition;
  readonly cm: UnitDefinition;
  readonly m: UnitDefinition;
  readonly km: UnitDefinition;
  readonly in: UnitDefinition;
  readonly ft: UnitDefinition;
  readonly yd: UnitDefinition;
  readonly mi: UnitDefinition;
  readonly nmi: UnitDefinition;
  readonly planck: UnitDefinition;
  readonly ly: UnitDefinition;
  readonly angstrom: UnitDefinition;
  readonly ftm: UnitDefinition;
  readonly ch: UnitDefinition;
  readonly fur: UnitDefinition;
  readonly smoot: UnitDefinition;
  readonly au: UnitDefinition;
  readonly pc: UnitDefinition;
} = {
  um: { toBase: 0.000001, aliases: ['µm', 'um', 'micrometer', 'micrometers', 'micrometre', 'micrometres', 'micron', 'microns'] },
  mm: { toBase: 0.001, aliases: ['mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres'] },
  cm: { toBase: 0.01, aliases: ['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'] },
  m: { toBase: 1, aliases: ['m', 'meter', 'meters', 'metre', 'metres'], subunit: 'cm' },
  km: { toBase: 1000, aliases: ['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres'] },
  in: { toBase: 0.0254, aliases: ['in', 'ins', 'inch', 'inches', '"'] },
  ft: { toBase: 0.3048, aliases: ['ft', 'foot', 'feet', "'"], subunit: 'in' },
  yd: { toBase: 0.9144, aliases: ['yd', 'yds', 'yard', 'yards'] },
  mi: { toBase: 1609.344, aliases: ['mi', 'mile', 'miles'] },
  // Not `nm` or `NM`: nanometers in one field, nautical miles in another.
  nmi: { toBase: 1852, aliases: ['nmi', 'nautical mile', 'nautical miles'] },
  // CODATA 2018. NFKC reads `ℓₚ` as `lp`, so `lP` and `l_P` are spelled out.
  planck: { toBase: 1.616255e-35, aliases: ['ℓₚ', 'ℓP', 'lP', 'l_P', 'planck length', 'planck lengths'] },
  // IAU: exactly 9,460,730,472,580,800 m.
  ly: { toBase: 9460730472580800, aliases: ['ly', 'light year', 'light years', 'light-year', 'light-years'] },
  // Exactly 10⁻¹⁰ m. NFKC turns the angstrom sign (U+212B) into `Å`.
  angstrom: { toBase: 1e-10, aliases: ['Å', 'ångström', 'ångströms', 'angstrom', 'angstroms'] },
  // Six feet, exactly.
  ftm: { toBase: 1.8288, aliases: ['ftm', 'fathom', 'fathoms'] },
  // Gunter's chain: 66 feet, a tenth of a furlong.
  ch: { toBase: 20.1168, aliases: ['ch', 'chain', 'chains'] },
  // 660 feet, an eighth of a mile.
  fur: { toBase: 201.168, aliases: ['fur', 'furlong', 'furlongs'] },
  // Oliver Smoot's height when MIT students measured the Harvard Bridge with him in 1958: 5 ft 7 in.
  smoot: { toBase: 1.7018, aliases: ['smoot', 'smoots'] },
  // IAU 2012: exactly 149,597,870,700 m.
  au: { toBase: 149597870700, aliases: ['au', 'astronomical unit', 'astronomical units'] },
  // IAU 2015: 648,000/π au, so not an exact decimal. `pc` is the parsec here, not the typographic pica.
  pc: { toBase: (648000 / Math.PI) * 149597870700, aliases: ['pc', 'parsec', 'parsecs'] },
};

export type LengthUnit = keyof typeof lengthUnits;

/** Lengths: `180cm`, `1,8 m`, `5'11"`, `5 ft 11 in`, `3 miles`. */
export const length = <C extends LengthUnit = LengthUnit>(options?: QuantityOptions<LengthUnit, C>): QuantityCodec<LengthUnit, C> =>
  quantity<typeof lengthUnits, C>({ id: 'length', units: lengthUnits, ...options });
