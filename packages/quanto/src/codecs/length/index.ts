import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from '../quantity';

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
};

export type LengthUnit = keyof typeof lengthUnits;

/** Lengths: `180cm`, `1,8 m`, `5'11"`, `5 ft 11 in`, `3 miles`. */
export const length = <C extends LengthUnit = LengthUnit>(options?: QuantityOptions<LengthUnit, C>): QuantityCodec<LengthUnit, C> =>
  quantity<typeof lengthUnits, C>({ id: 'length', units: lengthUnits, ...options });
