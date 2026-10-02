import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Acceleration units. Base unit: meters per second squared. `g` is standard gravity, 9.80665 m/s².
 */
export const accelerationUnits: {
  readonly mps2: UnitDefinition;
  readonly ftps2: UnitDefinition;
  readonly g: UnitDefinition;
} = {
  mps2: { toBase: 1, aliases: ['m/s²', 'm/s^2', 'm/s/s', 'meters per second squared', 'metres per second squared', 'meters per second per second', 'metres per second per second'] },
  ftps2: { toBase: 0.3048, aliases: ['ft/s²', 'ft/s^2', 'ft/s/s', 'feet per second squared', 'feet per second per second'] },
  g: { toBase: 9.80665, aliases: ['g', 'gs', 'g-force', 'g-forces', 'g force', 'gee', 'gees'] },
};

export type AccelerationUnit = keyof typeof accelerationUnits;

/** Accelerations: `9.8 m/s²`, `3 g`, `32 ft/s²`. */
export const acceleration = <C extends AccelerationUnit = AccelerationUnit>(options?: QuantityOptions<AccelerationUnit, C>): QuantityCodec<AccelerationUnit, C> =>
  quantity<typeof accelerationUnits, C>({ id: 'acceleration', units: accelerationUnits, ...options });
