import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from '../quantity';

/** Speed units: their own table, not derived from length and duration. Base unit: meters per second. */
export const speedUnits: {
  readonly mps: UnitDefinition;
  readonly kmh: UnitDefinition;
  readonly mph: UnitDefinition;
  readonly kn: UnitDefinition;
} = {
  mps: { toBase: 1, aliases: ['m/s', 'mps', 'meters per second', 'metres per second'] },
  kmh: { toBase: 1000 / 3600, aliases: ['km/h', 'kph', 'kmh', 'kmph', 'km per hour', 'kilometers per hour', 'kilometres per hour'] },
  mph: { toBase: 0.44704, aliases: ['mph', 'mi/h', 'miles per hour', 'mile per hour'] },
  kn: { toBase: 1852 / 3600, aliases: ['kn', 'kt', 'kts', 'knot', 'knots'] },
};

export type SpeedUnit = keyof typeof speedUnits;

/** Speeds: `60 mph`, `100 km/h`, `10 m/s`, `20 knots`. */
export const speed = <C extends SpeedUnit = SpeedUnit>(options?: QuantityOptions<SpeedUnit, C>): QuantityCodec<SpeedUnit, C> =>
  quantity<typeof speedUnits, C>({ id: 'speed', units: speedUnits, ...options });
