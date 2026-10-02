import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Density units. Base unit: kilograms per cubic meter. Gallons are US gallons, as in `volume`.
 */
export const densityUnits: {
  readonly kgpm3: UnitDefinition;
  readonly gpL: UnitDefinition;
  readonly kgpL: UnitDefinition;
  readonly gpcm3: UnitDefinition;
  readonly lbpft3: UnitDefinition;
  readonly lbpin3: UnitDefinition;
  readonly lbpgal: UnitDefinition;
} = {
  kgpm3: { toBase: 1, aliases: ['kg/m³', 'kg/m^3', 'kilograms per cubic meter', 'kilograms per cubic metre'] },
  gpL: { toBase: 1, aliases: ['g/L', 'g/l', 'grams per liter', 'grams per litre'] },
  kgpL: { toBase: 1e3, aliases: ['kg/L', 'kg/l', 'kilograms per liter', 'kilograms per litre'] },
  gpcm3: { toBase: 1e3, aliases: ['g/cm³', 'g/cm^3', 'g/cc', 'g/mL', 'g/ml', 'grams per cubic centimeter', 'grams per cubic centimetre', 'grams per milliliter', 'grams per millilitre'] },
  lbpft3: { toBase: 16.018463373960138, aliases: ['lb/ft³', 'lb/ft^3', 'lb/cu ft', 'pcf', 'pounds per cubic foot'] },
  lbpin3: { toBase: 27679.904710203125, aliases: ['lb/in³', 'lb/in^3', 'lb/cu in', 'pounds per cubic inch'] },
  lbpgal: { toBase: 119.82642731689663, aliases: ['lb/gal', 'ppg', 'pounds per gallon'] },
};

export type DensityUnit = keyof typeof densityUnits;

/** Densities: `1000 kg/m³`, `7.85 g/cm³`, `62.4 lb/ft³`. */
export const density = <C extends DensityUnit = DensityUnit>(options?: QuantityOptions<DensityUnit, C>): QuantityCodec<DensityUnit, C> =>
  quantity<typeof densityUnits, C>({ id: 'density', units: densityUnits, ...options });
