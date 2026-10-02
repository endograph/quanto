import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Electric current units. Base unit: the ampere. There's no mega-, so `ma` means milliamps.
 */
export const currentUnits: {
  readonly uA: UnitDefinition;
  readonly mA: UnitDefinition;
  readonly A: UnitDefinition;
  readonly kA: UnitDefinition;
} = {
  uA: { toBase: 1e-6, aliases: ['µA', 'uA', 'microamp', 'microamps', 'microampere', 'microamperes'] },
  mA: { toBase: 1e-3, aliases: ['mA', 'milliamp', 'milliamps', 'milliampere', 'milliamperes'] },
  A: { toBase: 1, aliases: ['A', 'amp', 'amps', 'ampere', 'amperes'] },
  kA: { toBase: 1e3, aliases: ['kA', 'kiloamp', 'kiloamps', 'kiloampere', 'kiloamperes'] },
};

export type CurrentUnit = keyof typeof currentUnits;

/** Electric currents: `16 A`, `500 mA`, `20 µA`. */
export const current = <C extends CurrentUnit = CurrentUnit>(options?: QuantityOptions<CurrentUnit, C>): QuantityCodec<CurrentUnit, C> =>
  quantity<typeof currentUnits, C>({ id: 'current', units: currentUnits, ...options });
