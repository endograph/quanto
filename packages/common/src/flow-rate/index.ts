import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Volumetric flow rate units. Base unit: liters per second. Gallons are US gallons, as in `volume`.
 */
export const flowRateUnits: {
  readonly mLph: UnitDefinition;
  readonly mLpmin: UnitDefinition;
  readonly Lph: UnitDefinition;
  readonly Lpmin: UnitDefinition;
  readonly Lps: UnitDefinition;
  readonly m3ph: UnitDefinition;
  readonly m3ps: UnitDefinition;
  readonly gph: UnitDefinition;
  readonly gpm: UnitDefinition;
  readonly cfm: UnitDefinition;
  readonly cfs: UnitDefinition;
} = {
  mLph: { toBase: 1 / 3_600_000, aliases: ['mL/h', 'ml/h', 'mL/hr', 'ml/hr', 'milliliters per hour', 'millilitres per hour'] },
  mLpmin: { toBase: 1 / 60_000, aliases: ['mL/min', 'ml/min', 'milliliters per minute', 'millilitres per minute'] },
  Lph: { toBase: 1 / 3600, aliases: ['L/h', 'l/h', 'L/hr', 'l/hr', 'lph', 'liters per hour', 'litres per hour'] },
  Lpmin: { toBase: 1 / 60, aliases: ['L/min', 'l/min', 'lpm', 'liters per minute', 'litres per minute'] },
  Lps: { toBase: 1, aliases: ['L/s', 'l/s', 'lps', 'liters per second', 'litres per second'] },
  m3ph: { toBase: 1 / 3.6, aliases: ['m³/h', 'm^3/h', 'm³/hr', 'cubic meters per hour', 'cubic metres per hour'] },
  m3ps: { toBase: 1e3, aliases: ['m³/s', 'm^3/s', 'cumecs', 'cubic meters per second', 'cubic metres per second'] },
  gph: { toBase: 3.785411784 / 3600, aliases: ['gph', 'gal/h', 'gal/hr', 'gallons per hour'] },
  gpm: { toBase: 3.785411784 / 60, aliases: ['gpm', 'gal/min', 'gallons per minute'] },
  cfm: { toBase: 0.4719474432, aliases: ['cfm', 'ft³/min', 'ft^3/min', 'cubic feet per minute'] },
  cfs: { toBase: 28.316846592, aliases: ['cfs', 'ft³/s', 'ft^3/s', 'cusecs', 'cubic feet per second'] },
};

export type FlowRateUnit = keyof typeof flowRateUnits;

/** Flow rates: `12 L/min`, `2.5 gpm`, `400 cfm`, `5 m³/h`. */
export const flowRate = <C extends FlowRateUnit = FlowRateUnit>(options?: QuantityOptions<FlowRateUnit, C>): QuantityCodec<FlowRateUnit, C> =>
  quantity<typeof flowRateUnits, C>({ id: 'flowRate', units: flowRateUnits, ...options });
