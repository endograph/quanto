import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Absorbed dose units: the energy radiation deposits, as in radiotherapy. Base unit: the gray.
 * The dose to a person (sieverts) is a different quantity, in `radiationDose`.
 */
export const absorbedDoseUnits: {
  readonly mGy: UnitDefinition;
  readonly cGy: UnitDefinition;
  readonly Gy: UnitDefinition;
  readonly rad: UnitDefinition;
} = {
  mGy: { toBase: 1e-3, aliases: ['mGy', 'milligray', 'milligrays'] },
  cGy: { toBase: 1e-2, aliases: ['cGy', 'centigray', 'centigrays'] },
  Gy: { toBase: 1, aliases: ['Gy', 'gray', 'grays'] },
  rad: { toBase: 1e-2, aliases: ['rad', 'rads'] },
};

export type AbsorbedDoseUnit = keyof typeof absorbedDoseUnits;

/** Absorbed doses: `2 Gy`, `180 cGy`, `50 rad`. */
export const absorbedDose = <C extends AbsorbedDoseUnit = AbsorbedDoseUnit>(options?: QuantityOptions<AbsorbedDoseUnit, C>): QuantityCodec<AbsorbedDoseUnit, C> =>
  quantity<typeof absorbedDoseUnits, C>({ id: 'absorbedDose', units: absorbedDoseUnits, ...options });
