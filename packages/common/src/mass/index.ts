import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/** Mass units. Base unit: the kilogram. `ton` is left out: it means different masses in the US, UK and metric use. */
export const massUnits: {
  readonly mg: UnitDefinition;
  readonly g: UnitDefinition;
  readonly kg: UnitDefinition;
  readonly t: UnitDefinition;
  readonly oz: UnitDefinition;
  readonly lb: UnitDefinition;
  readonly st: UnitDefinition;
} = {
  mg: { toBase: 0.000001, aliases: ['mg', 'milligram', 'milligrams', 'milligramme', 'milligrammes'] },
  g: { toBase: 0.001, aliases: ['g', 'gm', 'gms', 'gram', 'grams', 'gramme', 'grammes'] },
  kg: { toBase: 1, aliases: ['kg', 'kgs', 'kilogram', 'kilograms', 'kilogramme', 'kilogrammes', 'kilo', 'kilos'] },
  t: { toBase: 1000, aliases: ['t', 'tonne', 'tonnes', 'metric ton', 'metric tons'] },
  oz: { toBase: 0.028349523125, aliases: ['oz', 'ozs', 'ounce', 'ounces'] },
  lb: { toBase: 0.45359237, aliases: ['lb', 'lbs', 'pound', 'pounds', '#'], subunit: 'oz' },
  st: { toBase: 6.35029318, aliases: ['st', 'stone', 'stones'], subunit: 'lb' },
};

export type MassUnit = keyof typeof massUnits;

/** Masses: `70 kg`, `154 lbs`, `1 lb 4 oz`, `11 st 4`. */
export const mass = <C extends MassUnit = MassUnit>(options?: QuantityOptions<MassUnit, C>): QuantityCodec<MassUnit, C> =>
  quantity<typeof massUnits, C>({ id: 'mass', units: massUnits, ...options });
