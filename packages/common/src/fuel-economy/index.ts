import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

const MI_PER_KM = 1.609344;

/**
 * Fuel economy units. Base unit: km per liter, so a bigger base value is more efficient and `compare`
 * orders from worst to best. L/100km is the reciprocal, so it's a function unit. `mpg` is US miles per
 * gallon; UK miles per gallon is `mpg (imp)`.
 */
export const fuelEconomyUnits: {
  readonly kmpl: UnitDefinition;
  readonly mpg: UnitDefinition;
  readonly mpgImp: UnitDefinition;
  readonly lp100km: UnitDefinition;
} = {
  kmpl: { toBase: 1, aliases: ['km/L', 'kmpl', 'km per liter', 'km per litre', 'kilometers per liter', 'kilometres per litre'] },
  mpg: { toBase: MI_PER_KM / 3.785411784, aliases: ['mpg', 'mpg (US)', 'mpg US', 'mi/gal', 'miles per gallon'] },
  mpgImp: { toBase: MI_PER_KM / 4.54609, aliases: ['mpg (imp)', 'mpg imp', 'mpg (UK)', 'mpg UK', 'miles per imperial gallon'] },
  lp100km: {
    toBase: (v) => 100 / v,
    fromBase: (kmpl) => 100 / kmpl,
    aliases: ['L/100km', 'L/100 km', 'l/100', 'liters per 100 km', 'litres per 100 km'],
  },
};

export type FuelEconomyUnit = keyof typeof fuelEconomyUnits;

/**
 * Fuel economy: `30 mpg`, `7.8 L/100km`, `15 km/L`. `0 L/100km`, and `0 mpg` converted to L/100km,
 * are unparseable: they have no value in the other units.
 */
export const fuelEconomy = <C extends FuelEconomyUnit = FuelEconomyUnit>(
  options?: QuantityOptions<FuelEconomyUnit, C>,
): QuantityCodec<FuelEconomyUnit, C> => quantity<typeof fuelEconomyUnits, C>({ id: 'fuelEconomy', units: fuelEconomyUnits, ...options });
