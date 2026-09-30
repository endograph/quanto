import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto/codecs';

/**
 * Pressure units. Base unit: the pascal. There's no millipascal, so `mpa` means megapascals. Compound
 * readings like blood pressure (`120/80`) need a custom codec.
 */
export const pressureUnits: {
  readonly Pa: UnitDefinition;
  readonly hPa: UnitDefinition;
  readonly kPa: UnitDefinition;
  readonly MPa: UnitDefinition;
  readonly mbar: UnitDefinition;
  readonly bar: UnitDefinition;
  readonly psi: UnitDefinition;
  readonly atm: UnitDefinition;
  readonly mmHg: UnitDefinition;
  readonly inHg: UnitDefinition;
} = {
  Pa: { toBase: 1, aliases: ['Pa', 'pascal', 'pascals'] },
  hPa: { toBase: 100, aliases: ['hPa', 'hectopascal', 'hectopascals'] },
  kPa: { toBase: 1e3, aliases: ['kPa', 'kilopascal', 'kilopascals'] },
  MPa: { toBase: 1e6, aliases: ['MPa', 'megapascal', 'megapascals'] },
  mbar: { toBase: 100, aliases: ['mbar', 'millibar', 'millibars'] },
  bar: { toBase: 1e5, aliases: ['bar', 'bars'] },
  psi: { toBase: 6894.757293168361, aliases: ['psi', 'lb/in²', 'pounds per square inch'] },
  atm: { toBase: 101325, aliases: ['atm', 'atmosphere', 'atmospheres'] },
  mmHg: { toBase: 133.322387415, aliases: ['mmHg', 'mm Hg', 'millimeters of mercury', 'millimetres of mercury'] },
  inHg: { toBase: 3386.389, aliases: ['inHg', 'in Hg', 'inches of mercury'] },
};

export type PressureUnit = keyof typeof pressureUnits;

/** Pressure: `32 psi`, `2.2 bar`, `1013 hPa`, `29.92 inHg`. */
export const pressure = <C extends PressureUnit = PressureUnit>(options?: QuantityOptions<PressureUnit, C>): QuantityCodec<PressureUnit, C> =>
  quantity<typeof pressureUnits, C>({ id: 'pressure', units: pressureUnits, ...options });
