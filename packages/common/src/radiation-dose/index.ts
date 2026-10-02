import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Radiation dose units: equivalent and effective dose, the dose to a person. Base unit: the sievert.
 * Absorbed dose (grays) is a different quantity, in `absorbedDose`.
 */
export const radiationDoseUnits: {
  readonly uSv: UnitDefinition;
  readonly mSv: UnitDefinition;
  readonly Sv: UnitDefinition;
  readonly mrem: UnitDefinition;
  readonly rem: UnitDefinition;
} = {
  uSv: { toBase: 1e-6, aliases: ['µSv', 'uSv', 'microsievert', 'microsieverts'] },
  mSv: { toBase: 1e-3, aliases: ['mSv', 'millisievert', 'millisieverts'] },
  Sv: { toBase: 1, aliases: ['Sv', 'sievert', 'sieverts'] },
  mrem: { toBase: 1e-5, aliases: ['mrem', 'millirem', 'millirems'] },
  rem: { toBase: 1e-2, aliases: ['rem', 'rems'] },
};

export type RadiationDoseUnit = keyof typeof radiationDoseUnits;

/** Radiation doses: `2.4 mSv`, `10 µSv`, `500 mrem`. */
export const radiationDose = <C extends RadiationDoseUnit = RadiationDoseUnit>(options?: QuantityOptions<RadiationDoseUnit, C>): QuantityCodec<RadiationDoseUnit, C> =>
  quantity<typeof radiationDoseUnits, C>({ id: 'radiationDose', units: radiationDoseUnits, ...options });
