import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Volume units. Base unit: the liter. Customary units are US measures; UK imperial pints and gallons
 * differ, and need a custom table.
 */
export const volumeUnits: {
  readonly ml: UnitDefinition;
  readonly cl: UnitDefinition;
  readonly dl: UnitDefinition;
  readonly l: UnitDefinition;
  readonly m3: UnitDefinition;
  readonly tsp: UnitDefinition;
  readonly tbsp: UnitDefinition;
  readonly floz: UnitDefinition;
  readonly cup: UnitDefinition;
  readonly pt: UnitDefinition;
  readonly qt: UnitDefinition;
  readonly gal: UnitDefinition;
} = {
  ml: { toBase: 0.001, aliases: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'cc', 'cm³'] },
  cl: { toBase: 0.01, aliases: ['cl', 'centiliter', 'centiliters', 'centilitre', 'centilitres'] },
  dl: { toBase: 0.1, aliases: ['dl', 'deciliter', 'deciliters', 'decilitre', 'decilitres'] },
  l: { toBase: 1, aliases: ['l', 'liter', 'liters', 'litre', 'litres', 'ltr'] },
  m3: { toBase: 1000, aliases: ['m³', 'cubic meter', 'cubic meters', 'cubic metre', 'cubic metres'] },
  tsp: { toBase: 0.00492892159375, aliases: ['tsp', 'teaspoon', 'teaspoons'] },
  tbsp: { toBase: 0.01478676478125, aliases: ['tbsp', 'tablespoon', 'tablespoons'] },
  floz: { toBase: 0.0295735295625, aliases: ['fl oz', 'fl. oz.', 'floz', 'fluid ounce', 'fluid ounces'] },
  cup: { toBase: 0.2365882365, aliases: ['cup', 'cups'] },
  pt: { toBase: 0.473176473, aliases: ['pt', 'pint', 'pints'] },
  qt: { toBase: 0.946352946, aliases: ['qt', 'quart', 'quarts'] },
  gal: { toBase: 3.785411784, aliases: ['gal', 'gallon', 'gallons'] },
};

export type VolumeUnit = keyof typeof volumeUnits;

/** Volumes: `500 ml`, `1,5 l`, `2 cups`, `12 fl oz`, `1 gal`. */
export const volume = <C extends VolumeUnit = VolumeUnit>(options?: QuantityOptions<VolumeUnit, C>): QuantityCodec<VolumeUnit, C> =>
  quantity<typeof volumeUnits, C>({ id: 'volume', units: volumeUnits, ...options });
