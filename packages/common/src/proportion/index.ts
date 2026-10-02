import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Proportion units. Base unit: the whole (1). Unlike `percent`, the unit is kept: `25 bps` stays basis
 * points and converts to `0.25%`. `ppt` is left out: it means parts per thousand and per trillion.
 */
export const proportionUnits: {
  readonly percent: UnitDefinition;
  readonly permille: UnitDefinition;
  readonly bp: UnitDefinition;
  readonly ppm: UnitDefinition;
  readonly ppb: UnitDefinition;
} = {
  percent: { toBase: 0.01, aliases: ['%', 'percent', 'per cent', 'pct'] },
  permille: { toBase: 0.001, aliases: ['‰', 'per mille', 'per mil', 'permille', 'per thousand'] },
  bp: { toBase: 0.0001, aliases: ['bp', 'bps', 'basis point', 'basis points', 'bips', '‱'] },
  ppm: { toBase: 1e-6, aliases: ['ppm', 'parts per million'] },
  ppb: { toBase: 1e-9, aliases: ['ppb', 'parts per billion'] },
};

export type ProportionUnit = keyof typeof proportionUnits;

/** Proportions that keep their unit: `12.5%`, `5‰`, `25 bps`, `420 ppm`. */
export const proportion = <C extends ProportionUnit = ProportionUnit>(options?: QuantityOptions<ProportionUnit, C>): QuantityCodec<ProportionUnit, C> =>
  quantity<typeof proportionUnits, C>({ id: 'proportion', units: proportionUnits, ...options });
