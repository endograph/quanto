import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto/codecs';

/**
 * Angle units. Base unit: the arcsecond, so degrees, minutes and seconds convert exactly. Degrees take
 * arcminutes as their subunit and arcminutes take arcseconds: `40°26'46"` and `40°26` both work.
 */
export const angleUnits: {
  readonly deg: UnitDefinition;
  readonly arcmin: UnitDefinition;
  readonly arcsec: UnitDefinition;
  readonly rad: UnitDefinition;
  readonly grad: UnitDefinition;
  readonly turn: UnitDefinition;
} = {
  deg: { toBase: 3600, aliases: ['°', 'deg', 'degs', 'degree', 'degrees'], subunit: 'arcmin' },
  arcmin: { toBase: 60, aliases: ["'", 'arcmin', 'arcminute', 'arcminutes'], subunit: 'arcsec' },
  arcsec: { toBase: 1, aliases: ['"', 'arcsec', 'arcsecond', 'arcseconds'] },
  rad: { toBase: 648000 / Math.PI, aliases: ['rad', 'rads', 'radian', 'radians'] },
  grad: { toBase: 3240, aliases: ['grad', 'grads', 'gradian', 'gradians', 'gon'] },
  turn: { toBase: 1296000, aliases: ['turn', 'turns', 'rev', 'revs', 'revolution', 'revolutions'] },
};

export type AngleUnit = keyof typeof angleUnits;

/** Angles: `45°`, `1.2 rad`, `40°26'46"`, `0.25 turn`. */
export const angle = <C extends AngleUnit = AngleUnit>(options?: QuantityOptions<AngleUnit, C>): QuantityCodec<AngleUnit, C> =>
  quantity<typeof angleUnits, C>({ id: 'angle', units: angleUnits, ...options });
