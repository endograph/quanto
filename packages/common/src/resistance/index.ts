import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Electrical resistance units. Base unit: the ohm. `mΩ` and `MΩ` differ only by case, so they match
 * exactly as written; so do `mohm` and `Mohm`.
 */
export const resistanceUnits: {
  readonly mohm: UnitDefinition;
  readonly ohm: UnitDefinition;
  readonly kohm: UnitDefinition;
  readonly Mohm: UnitDefinition;
} = {
  mohm: { toBase: 1e-3, aliases: ['mΩ', 'mohm', 'mohms', 'milliohm', 'milliohms'] },
  ohm: { toBase: 1, aliases: ['Ω', 'ohm', 'ohms'] },
  kohm: { toBase: 1e3, aliases: ['kΩ', 'kohm', 'kohms', 'kiloohm', 'kiloohms', 'kilohm', 'kilohms'] },
  Mohm: { toBase: 1e6, aliases: ['MΩ', 'Mohm', 'Mohms', 'megaohm', 'megaohms', 'megohm', 'megohms'] },
};

export type ResistanceUnit = keyof typeof resistanceUnits;

/** Resistances: `220 Ω`, `4.7 kΩ`, `10 kohm`, `1 MΩ`. */
export const resistance = <C extends ResistanceUnit = ResistanceUnit>(options?: QuantityOptions<ResistanceUnit, C>): QuantityCodec<ResistanceUnit, C> =>
  quantity<typeof resistanceUnits, C>({ id: 'resistance', units: resistanceUnits, ...options });
