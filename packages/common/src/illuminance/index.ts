import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Illuminance units: how much light falls on a surface. Base unit: the lux.
 */
export const illuminanceUnits: {
  readonly lx: UnitDefinition;
  readonly klx: UnitDefinition;
  readonly fc: UnitDefinition;
} = {
  lx: { toBase: 1, aliases: ['lx', 'lux'] },
  klx: { toBase: 1e3, aliases: ['klx', 'kilolux'] },
  fc: { toBase: 10.763910416709722, aliases: ['fc', 'ftcd', 'foot-candle', 'foot-candles', 'foot candle', 'foot candles', 'footcandle', 'footcandles'] },
};

export type IlluminanceUnit = keyof typeof illuminanceUnits;

/** Light levels: `500 lx`, `50 fc`. */
export const illuminance = <C extends IlluminanceUnit = IlluminanceUnit>(options?: QuantityOptions<IlluminanceUnit, C>): QuantityCodec<IlluminanceUnit, C> =>
  quantity<typeof illuminanceUnits, C>({ id: 'illuminance', units: illuminanceUnits, ...options });
