import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Luminance units: how bright a screen or surface is. Base unit: the nit, a candela per square meter.
 */
export const luminanceUnits: {
  readonly nit: UnitDefinition;
  readonly fL: UnitDefinition;
} = {
  nit: { toBase: 1, aliases: ['nits', 'nit', 'cd/m²', 'cd/m^2', 'candela per square meter', 'candela per square metre', 'candelas per square meter', 'candelas per square metre'] },
  fL: { toBase: 3.4262590996353905, aliases: ['fL', 'foot-lambert', 'foot-lamberts', 'foot lambert', 'foot lamberts', 'footlambert', 'footlamberts'] },
};

export type LuminanceUnit = keyof typeof luminanceUnits;

/** Screen brightness: `1000 nits`, `500 cd/m²`, `14 fL`. */
export const luminance = <C extends LuminanceUnit = LuminanceUnit>(options?: QuantityOptions<LuminanceUnit, C>): QuantityCodec<LuminanceUnit, C> =>
  quantity<typeof luminanceUnits, C>({ id: 'luminance', units: luminanceUnits, ...options });
