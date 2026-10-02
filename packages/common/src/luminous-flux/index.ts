import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Luminous flux units: how much light a bulb or projector puts out. Base unit: the lumen.
 */
export const luminousFluxUnits: {
  readonly lm: UnitDefinition;
  readonly klm: UnitDefinition;
} = {
  lm: { toBase: 1, aliases: ['lm', 'lumen', 'lumens', 'ANSI lumens'] },
  klm: { toBase: 1e3, aliases: ['klm', 'kilolumen', 'kilolumens'] },
};

export type LuminousFluxUnit = keyof typeof luminousFluxUnits;

/** Light output: `800 lm`, `3000 lumens`. */
export const luminousFlux = <C extends LuminousFluxUnit = LuminousFluxUnit>(options?: QuantityOptions<LuminousFluxUnit, C>): QuantityCodec<LuminousFluxUnit, C> =>
  quantity<typeof luminousFluxUnits, C>({ id: 'luminousFlux', units: luminousFluxUnits, ...options });
