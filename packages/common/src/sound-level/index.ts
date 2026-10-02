import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/** The reference sound pressure, 20 µPa: 0 dB SPL, about the threshold of hearing. */
const P0 = 20e-6;

/**
 * Sound level units. Base unit: the decibel of sound pressure level (dB SPL). Weighted readings are on
 * their own scales: 85 dB(A) and 85 dB(C) are readings of one sound through different filters, and the
 * weighting depends on frequency, so neither converts to the other or to unweighted dB. Sound pressure
 * in pascals is on the unweighted scale (94 dB is about 1 Pa).
 */
export const soundLevelUnits: {
  readonly dB: UnitDefinition;
  readonly Pa: UnitDefinition;
  readonly dBA: UnitDefinition;
  readonly dBC: UnitDefinition;
} = {
  dB: { toBase: 1, aliases: ['dB', 'dB SPL', 'decibel', 'decibels'] },
  Pa: { toBase: (pa) => 20 * Math.log10(pa / P0), fromBase: (db) => P0 * 10 ** (db / 20), aliases: ['Pa', 'pascal', 'pascals'] },
  dBA: { toBase: 1, scale: 'A', aliases: ['dBA', 'dB(A)', 'dB A', 'A-weighted decibels'] },
  dBC: { toBase: 1, scale: 'C', aliases: ['dBC', 'dB(C)', 'dB C', 'C-weighted decibels'] },
};

export type SoundLevelUnit = keyof typeof soundLevelUnits;

/** Sound levels: `85 dB`, `70 dBA`, `100 dB(C)`, `2 Pa`. */
export const soundLevel = <C extends SoundLevelUnit = SoundLevelUnit>(options?: QuantityOptions<SoundLevelUnit, C>): QuantityCodec<SoundLevelUnit, C> =>
  quantity<typeof soundLevelUnits, C>({ id: 'soundLevel', units: soundLevelUnits, ...options });
