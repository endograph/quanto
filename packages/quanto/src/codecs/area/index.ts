import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from '../quantity';

/** Area units. Base unit: the square meter. `m²` and `m2` are the same alias after normalization. */
export const areaUnits: {
  readonly cm2: UnitDefinition;
  readonly m2: UnitDefinition;
  readonly ha: UnitDefinition;
  readonly km2: UnitDefinition;
  readonly in2: UnitDefinition;
  readonly ft2: UnitDefinition;
  readonly yd2: UnitDefinition;
  readonly ac: UnitDefinition;
  readonly mi2: UnitDefinition;
} = {
  cm2: { toBase: 0.0001, aliases: ['cm²', 'sq cm', 'square centimeter', 'square centimeters', 'square centimetre', 'square centimetres'] },
  m2: { toBase: 1, aliases: ['m²', 'sq m', 'sqm', 'square meter', 'square meters', 'square metre', 'square metres'] },
  ha: { toBase: 10000, aliases: ['ha', 'hectare', 'hectares'] },
  km2: { toBase: 1000000, aliases: ['km²', 'sq km', 'square kilometer', 'square kilometers', 'square kilometre', 'square kilometres'] },
  in2: { toBase: 0.00064516, aliases: ['in²', 'sq in', 'square inch', 'square inches'] },
  ft2: { toBase: 0.09290304, aliases: ['ft²', 'sq ft', 'sqft', 'square foot', 'square feet'] },
  yd2: { toBase: 0.83612736, aliases: ['yd²', 'sq yd', 'square yard', 'square yards'] },
  ac: { toBase: 4046.8564224, aliases: ['ac', 'acre', 'acres'] },
  mi2: { toBase: 2589988.110336, aliases: ['mi²', 'sq mi', 'square mile', 'square miles'] },
};

export type AreaUnit = keyof typeof areaUnits;

/** Areas: `500 sq ft`, `80 m²`, `2 acres`, `1 ha`. */
export const area = <C extends AreaUnit = AreaUnit>(options?: QuantityOptions<AreaUnit, C>): QuantityCodec<AreaUnit, C> =>
  quantity<typeof areaUnits, C>({ id: 'area', units: areaUnits, ...options });
