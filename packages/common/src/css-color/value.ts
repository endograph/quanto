import type { CheckProblem } from 'quanto';

/** The color spaces a `CssColor` can be in: those of CSS's color functions, and `color()`'s predefined ones. */
export const cssColorSpaces = [
  'srgb',
  'hsl',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'srgb-linear',
  'display-p3',
  'a98-rgb',
  'prophoto-rgb',
  'rec2020',
  'xyz-d50',
  'xyz-d65',
] as const;

export type CssColorSpace = (typeof cssColorSpaces)[number];

/**
 * A CSS color, in the space it was written in; nothing is converted. Coordinates are CSS's own numbers
 * for the space, as `color()` and the color functions take them without percentages:
 *
 * - `srgb` (hex, names, `rgb()`, `color(srgb …)`), and `color()`'s RGB spaces: red, green and blue, 0 to 1
 *   in gamut. `rgb()` clamps to that range; `color()` doesn't, so out-of-gamut values are kept.
 * - `xyz-d50`, `xyz-d65`: X, Y and Z, with Y 1 for the reference white.
 * - `hsl`: hue in degrees [0, 360), saturation and lightness 0 to 100. `hwb`: hue, whiteness and blackness.
 * - `lab`: lightness 0 to 100, a and b. `lch`: lightness, chroma (≥ 0) and hue.
 * - `oklab`: lightness 0 to 1, a and b. `oklch`: lightness, chroma (≥ 0) and hue.
 *
 * `alpha` is 0 to 1. A `none` component is stored as 0.
 */
export interface CssColor {
  readonly space: CssColorSpace;
  readonly coords: readonly [number, number, number];
  readonly alpha: number;
}

/** Each space's coordinate ranges, by coordinate; `undefined` is unbounded. Hues are [0, 360). */
type Bound = readonly [min: number | undefined, max: number | undefined, hue?: true];
const ANY: Bound = [undefined, undefined];
const HUE: Bound = [0, 360, true];
const PERCENT: Bound = [0, 100];

export const BOUNDS: Readonly<Record<CssColorSpace, readonly [Bound, Bound, Bound]>> = {
  srgb: [ANY, ANY, ANY],
  hsl: [HUE, PERCENT, PERCENT],
  hwb: [HUE, PERCENT, PERCENT],
  lab: [PERCENT, ANY, ANY],
  lch: [PERCENT, [0, undefined], HUE],
  oklab: [[0, 1], ANY, ANY],
  oklch: [[0, 1], [0, undefined], HUE],
  'srgb-linear': [ANY, ANY, ANY],
  'display-p3': [ANY, ANY, ANY],
  'a98-rgb': [ANY, ANY, ANY],
  'prophoto-rgb': [ANY, ANY, ANY],
  rec2020: [ANY, ANY, ANY],
  'xyz-d50': [ANY, ANY, ANY],
  'xyz-d65': [ANY, ANY, ANY],
};

const isSpace = (space: unknown): space is CssColorSpace => typeof space === 'string' && (cssColorSpaces as readonly string[]).includes(space);

/** The structural check: a known space, three finite coordinates in the space's ranges, and an alpha in [0, 1]. */
export function checkCssColor(value: unknown): CheckProblem[] {
  if (typeof value !== 'object' || value === null) return [{ message: 'Expected a CSS color: { space, coords, alpha }.' }];
  const { space, coords, alpha } = value as Record<string, unknown>;
  if (!isSpace(space)) return [{ message: `Unknown color space ${JSON.stringify(space)}; expected one of ${cssColorSpaces.join(', ')}.`, path: ['space'] }];
  if (!Array.isArray(coords) || coords.length !== 3) return [{ message: 'Expected three coordinates.', path: ['coords'] }];
  const problems: CheckProblem[] = [];
  coords.forEach((n: unknown, i) => {
    const [min, max, hue] = BOUNDS[space][i]!;
    if (typeof n !== 'number' || !Number.isFinite(n)) problems.push({ message: `Coordinate ${i} must be a finite number.`, path: ['coords', i] });
    else if ((min !== undefined && n < min) || (max !== undefined && (hue ? n >= max : n > max))) {
      problems.push({ message: `Coordinate ${i} of ${space} must be in [${min ?? '-∞'}, ${max ?? '∞'}${hue ? ')' : ']'}; got ${n}.`, path: ['coords', i] });
    }
  });
  if (typeof alpha !== 'number' || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) problems.push({ message: 'Alpha must be a number from 0 to 1.', path: ['alpha'] });
  return problems;
}
