import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/** Temperature units. Base unit: the kelvin. Celsius and Fahrenheit are affine (they have an offset). */
export const temperatureUnits: {
  readonly C: UnitDefinition;
  readonly F: UnitDefinition;
  readonly K: UnitDefinition;
} = {
  C: { toBase: { factor: 1, offset: 273.15 }, aliases: ['°C', '° C', 'C', 'degC', 'deg C', 'degrees C', 'celsius', 'degrees celsius', 'centigrade'] },
  F: {
    toBase: { factor: 5 / 9, offset: 273.15 - (32 * 5) / 9 },
    aliases: ['°F', '° F', 'F', 'degF', 'deg F', 'degrees F', 'fahrenheit', 'degrees fahrenheit'],
  },
  K: { toBase: 1, aliases: ['K', 'kelvin', 'kelvins'] },
};

export type TemperatureUnit = keyof typeof temperatureUnits;

/**
 * Temperatures: `20 °C`, `98.6F`, `-40 degrees fahrenheit`. Compound input doesn't apply. A degree sign
 * or word alone (`451°`, `20 degrees`) takes the `defaultUnit` if there is one, and otherwise the
 * region's: °F in the US, °C elsewhere. A bare number (`70`) still needs a unit.
 */
export const temperature = <C extends TemperatureUnit = TemperatureUnit>(
  options?: QuantityOptions<TemperatureUnit, C>,
): QuantityCodec<TemperatureUnit, C> => quantity<typeof temperatureUnits, C>({ id: 'temperature', units: temperatureUnits, markers: ['°', 'deg', 'degs', 'degree', 'degrees'], markerUnit: { us: 'F', uk: 'C', metric: 'C' }, ...options });
