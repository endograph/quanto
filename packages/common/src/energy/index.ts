import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Energy units. Base unit: the joule. `cal`, `Cal` and `calories` mean kilocalories, as on food labels;
 * the small calorie isn't included.
 */
export const energyUnits: {
  readonly J: UnitDefinition;
  readonly kJ: UnitDefinition;
  readonly MJ: UnitDefinition;
  readonly kcal: UnitDefinition;
  readonly Wh: UnitDefinition;
  readonly kWh: UnitDefinition;
  readonly MWh: UnitDefinition;
  readonly BTU: UnitDefinition;
} = {
  J: { toBase: 1, aliases: ['J', 'joule', 'joules'] },
  kJ: { toBase: 1e3, aliases: ['kJ', 'kilojoule', 'kilojoules'] },
  MJ: { toBase: 1e6, aliases: ['MJ', 'megajoule', 'megajoules'] },
  kcal: { toBase: 4184, aliases: ['kcal', 'kcals', 'Cal', 'cals', 'calorie', 'calories', 'kilocalorie', 'kilocalories'] },
  Wh: { toBase: 3600, aliases: ['Wh', 'watt-hour', 'watt-hours', 'watt hour', 'watt hours'] },
  kWh: { toBase: 3.6e6, aliases: ['kWh', 'kilowatt-hour', 'kilowatt-hours', 'kilowatt hour', 'kilowatt hours'] },
  MWh: { toBase: 3.6e9, aliases: ['MWh', 'megawatt-hour', 'megawatt-hours', 'megawatt hour', 'megawatt hours'] },
  BTU: { toBase: 1055.05585262, aliases: ['BTU', 'BTUs', 'British thermal unit', 'British thermal units'] },
};

export type EnergyUnit = keyof typeof energyUnits;

/** Energy: `2000 kcal`, `3.5 kWh`, `100 kJ`, `1000 BTU`. */
export const energy = <C extends EnergyUnit = EnergyUnit>(options?: QuantityOptions<EnergyUnit, C>): QuantityCodec<EnergyUnit, C> =>
  quantity<typeof energyUnits, C>({ id: 'energy', units: energyUnits, ...options });
