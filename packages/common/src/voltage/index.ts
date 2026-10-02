import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Voltage units. Base unit: the volt. `mV` and `MV` differ only by case, so they match exactly as written.
 */
export const voltageUnits: {
  readonly uV: UnitDefinition;
  readonly mV: UnitDefinition;
  readonly V: UnitDefinition;
  readonly kV: UnitDefinition;
  readonly MV: UnitDefinition;
} = {
  uV: { toBase: 1e-6, aliases: ['µV', 'uV', 'microvolt', 'microvolts'] },
  mV: { toBase: 1e-3, aliases: ['mV', 'millivolt', 'millivolts'] },
  V: { toBase: 1, aliases: ['V', 'volt', 'volts'] },
  kV: { toBase: 1e3, aliases: ['kV', 'kilovolt', 'kilovolts'] },
  MV: { toBase: 1e6, aliases: ['MV', 'megavolt', 'megavolts'] },
};

export type VoltageUnit = keyof typeof voltageUnits;

/** Voltages: `230 V`, `3.3 V`, `500 mV`, `11 kV`. */
export const voltage = <C extends VoltageUnit = VoltageUnit>(options?: QuantityOptions<VoltageUnit, C>): QuantityCodec<VoltageUnit, C> =>
  quantity<typeof voltageUnits, C>({ id: 'voltage', units: voltageUnits, ...options });
