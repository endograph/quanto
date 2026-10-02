import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Force units. Base unit: the newton. Pounds- and kilograms-force are the weight of a pound or a kilogram
 * at standard gravity. `mN` and `MN` differ only by case, so they match exactly as written.
 */
export const forceUnits: {
  readonly mN: UnitDefinition;
  readonly N: UnitDefinition;
  readonly kN: UnitDefinition;
  readonly MN: UnitDefinition;
  readonly dyn: UnitDefinition;
  readonly lbf: UnitDefinition;
  readonly ozf: UnitDefinition;
  readonly kgf: UnitDefinition;
} = {
  mN: { toBase: 1e-3, aliases: ['mN', 'millinewton', 'millinewtons'] },
  N: { toBase: 1, aliases: ['N', 'newton', 'newtons'] },
  kN: { toBase: 1e3, aliases: ['kN', 'kilonewton', 'kilonewtons'] },
  MN: { toBase: 1e6, aliases: ['MN', 'meganewton', 'meganewtons'] },
  dyn: { toBase: 1e-5, aliases: ['dyn', 'dyne', 'dynes'] },
  lbf: { toBase: 4.4482216152605, aliases: ['lbf', 'pound-force', 'pounds-force', 'pound force', 'pounds force', 'pounds of force'] },
  ozf: { toBase: 0.2780138509537812, aliases: ['ozf', 'ounce-force', 'ounces-force', 'ounce force', 'ounces force'] },
  kgf: { toBase: 9.80665, aliases: ['kgf', 'kilogram-force', 'kilograms-force', 'kilogram force', 'kilograms force', 'kp', 'kilopond', 'kiloponds'] },
};

export type ForceUnit = keyof typeof forceUnits;

/** Forces: `500 N`, `2 kN`, `100 lbf`, `50 kgf`. */
export const force = <C extends ForceUnit = ForceUnit>(options?: QuantityOptions<ForceUnit, C>): QuantityCodec<ForceUnit, C> =>
  quantity<typeof forceUnits, C>({ id: 'force', units: forceUnits, ...options });
