import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Color temperature units: the correlated color temperature of a light source. Base unit: the kelvin.
 * The mired (micro reciprocal degree, also mirek) is a million over the kelvin, so it's a function unit,
 * and a higher mired is a warmer light.
 */
export const colorTemperatureUnits: {
  readonly K: UnitDefinition;
  readonly mired: UnitDefinition;
} = {
  K: { toBase: 1, aliases: ['K', 'kelvin', 'kelvins'] },
  mired: {
    toBase: (v) => 1e6 / v,
    fromBase: (k) => 1e6 / k,
    aliases: ['mired', 'mireds', 'mirek', 'mireks', 'MK-1', 'MK^-1'],
  },
};

export type ColorTemperatureUnit = keyof typeof colorTemperatureUnits;

/**
 * Color temperatures of light: `2700 K`, `6500 kelvin`, `153 mired`. Thermodynamic temperatures are
 * `temperature`, which has kelvins too; this codec has no °C or °F. `0 mired` has no value in kelvins.
 */
export const colorTemperature = <C extends ColorTemperatureUnit = ColorTemperatureUnit>(
  options?: QuantityOptions<ColorTemperatureUnit, C>,
): QuantityCodec<ColorTemperatureUnit, C> => quantity<typeof colorTemperatureUnits, C>({ id: 'colorTemperature', units: colorTemperatureUnits, ...options });
