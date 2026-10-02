import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Electric charge units. Base unit: the coulomb. Amp hours are how batteries are rated; watt hours are
 * energy, in `energy`.
 */
export const chargeUnits: {
  readonly C: UnitDefinition;
  readonly mAh: UnitDefinition;
  readonly Ah: UnitDefinition;
} = {
  C: { toBase: 1, aliases: ['C', 'coulomb', 'coulombs'] },
  mAh: { toBase: 3.6, aliases: ['mAh', 'mA·h', 'mA h', 'milliamp hour', 'milliamp hours', 'milliamp-hours', 'milliampere hours', 'milliampere-hours'] },
  Ah: { toBase: 3600, aliases: ['Ah', 'A·h', 'amp hour', 'amp hours', 'amp-hours', 'ampere hours', 'ampere-hours'] },
};

export type ChargeUnit = keyof typeof chargeUnits;

/** Electric charge and battery capacity: `5000 mAh`, `100 Ah`, `1 C`. */
export const charge = <C extends ChargeUnit = ChargeUnit>(options?: QuantityOptions<ChargeUnit, C>): QuantityCodec<ChargeUnit, C> =>
  quantity<typeof chargeUnits, C>({ id: 'charge', units: chargeUnits, ...options });
