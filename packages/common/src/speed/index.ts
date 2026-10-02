import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/** Speed units: their own table, not derived from length and duration. Base unit: meters per second. */
export const speedUnits: {
  readonly mps: UnitDefinition;
  readonly kmh: UnitDefinition;
  readonly mph: UnitDefinition;
  readonly kn: UnitDefinition;
  readonly fps: UnitDefinition;
} = {
  mps: { toBase: 1, aliases: ['m/s', 'mps', 'meters per second', 'metres per second'] },
  kmh: { toBase: 1000 / 3600, aliases: ['km/h', 'km/hr', 'kph', 'kmh', 'kmph', 'km per hour', 'kilometers per hour', 'kilometres per hour'] },
  mph: { toBase: 0.44704, aliases: ['mph', 'mi/h', 'miles per hour', 'mile per hour'] },
  kn: { toBase: 1852 / 3600, aliases: ['kn', 'kt', 'kts', 'knot', 'knots'] },
  fps: { toBase: 0.3048, aliases: ['ft/s', 'fps', 'feet per second', 'foot per second'] },
};

export type SpeedUnit = keyof typeof speedUnits;

/** Speeds: `60 mph`, `100 km/h`, `10 m/s`, `20 knots`, `5 ft/s`. */
export const speed = <C extends SpeedUnit = SpeedUnit>(options?: QuantityOptions<SpeedUnit, C>): QuantityCodec<SpeedUnit, C> =>
  quantity<typeof speedUnits, C>({ id: 'speed', units: speedUnits, ...options });
