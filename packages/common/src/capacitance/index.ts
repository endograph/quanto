import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Capacitance units. Base unit: the farad. `uF` stands in for `µF`, as on parts lists. There's no
 * mega-, so `mf` means millifarads.
 */
export const capacitanceUnits: {
  readonly pF: UnitDefinition;
  readonly nF: UnitDefinition;
  readonly uF: UnitDefinition;
  readonly mF: UnitDefinition;
  readonly F: UnitDefinition;
} = {
  pF: { toBase: 1e-12, aliases: ['pF', 'picofarad', 'picofarads'] },
  nF: { toBase: 1e-9, aliases: ['nF', 'nanofarad', 'nanofarads'] },
  uF: { toBase: 1e-6, aliases: ['µF', 'uF', 'microfarad', 'microfarads'] },
  mF: { toBase: 1e-3, aliases: ['mF', 'millifarad', 'millifarads'] },
  F: { toBase: 1, aliases: ['F', 'farad', 'farads'] },
};

export type CapacitanceUnit = keyof typeof capacitanceUnits;

/** Capacitances: `100 µF`, `10 nF`, `22 pF`. */
export const capacitance = <C extends CapacitanceUnit = CapacitanceUnit>(options?: QuantityOptions<CapacitanceUnit, C>): QuantityCodec<CapacitanceUnit, C> =>
  quantity<typeof capacitanceUnits, C>({ id: 'capacitance', units: capacitanceUnits, ...options });
