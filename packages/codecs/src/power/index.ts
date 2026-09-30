import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto/codecs';

/**
 * Power units. Base unit: the watt. `mW` (milliwatt) and `MW` (megawatt) differ only by case, so those
 * aliases match exactly as written, and their unit IDs are spelled out so stored values never differ
 * only by case. `hp` is mechanical horsepower; `PS` is metric horsepower.
 */
export const powerUnits: {
  readonly milliwatt: UnitDefinition;
  readonly W: UnitDefinition;
  readonly kW: UnitDefinition;
  readonly megawatt: UnitDefinition;
  readonly GW: UnitDefinition;
  readonly hp: UnitDefinition;
  readonly PS: UnitDefinition;
  readonly BTUh: UnitDefinition;
} = {
  milliwatt: { toBase: 1e-3, aliases: ['mW', 'milliwatt', 'milliwatts'] },
  W: { toBase: 1, aliases: ['W', 'watt', 'watts'] },
  kW: { toBase: 1e3, aliases: ['kW', 'kilowatt', 'kilowatts'] },
  megawatt: { toBase: 1e6, aliases: ['MW', 'megawatt', 'megawatts'] },
  GW: { toBase: 1e9, aliases: ['GW', 'gigawatt', 'gigawatts'] },
  hp: { toBase: 745.69987158227022, aliases: ['hp', 'bhp', 'horsepower'] },
  PS: { toBase: 735.49875, aliases: ['PS', 'metric horsepower', 'metric hp'] },
  BTUh: { toBase: 1055.05585262 / 3600, aliases: ['BTU/h', 'BTU/hr', 'BTUh', 'BTUs per hour'] },
};

export type PowerUnit = keyof typeof powerUnits;

/** Power: `150 hp`, `3 kW`, `5 MW`, `12000 BTU/h`. */
export const power = <C extends PowerUnit = PowerUnit>(options?: QuantityOptions<PowerUnit, C>): QuantityCodec<PowerUnit, C> =>
  quantity<typeof powerUnits, C>({ id: 'power', units: powerUnits, ...options });
