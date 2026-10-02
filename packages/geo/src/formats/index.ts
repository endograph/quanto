// Formatters for the `coordinates` codec's `format` option. Each prints latitude first, whatever the
// codec's `order`, and each round-trips through `coordinates()` to within its rounding (geohashes need
// the `geohash` option to read back).

import { formatNumber } from 'quanto';
import type { Formatter } from 'quanto/formats';
import { toGeohash } from '../geohash';
import { toPlusCode } from '../plus-code';
import type { Coordinates } from '../value';

/** A formatter for the `coordinates` codec's `format` option. */
export type CoordinatesFormatter = Formatter<Coordinates>;

export type Axis = 'lat' | 'lng';

/** A coordinate's hemisphere letter. One that rounds to 0 in print is N or E, so `-0.0000001` isn't `0° W`. */
export const hemisphere = (value: number, roundsToZero: boolean, axis: Axis): string =>
  axis === 'lat' ? (value < 0 && !roundsToZero ? 'S' : 'N') : value < 0 && !roundsToZero ? 'W' : 'E';

/**
 * Splits a coordinate into whole degrees and the rest in `units` per degree, rounded to whole units and
 * carried (`10.999999°` to the second is `11°0'0"`).
 */
function split(value: number, units: number): { degrees: number; rest: number; zero: boolean } {
  const total = Math.round(Math.abs(value) * units);
  return { degrees: Math.floor(total / units), rest: total % units, zero: total === 0 };
}

const both = (value: Coordinates, part: (v: number, axis: Axis) => string): string => `${part(value.lat, 'lat')}, ${part(value.lng, 'lng')}`;

/** Degrees, minutes and seconds, seconds to a tenth (about 3 m): `40°42'46.1" N, 74°0'21.6" W`. */
export const degreesMinutesSeconds: CoordinatesFormatter = (value, ctx) =>
  both(value, (v, axis) => {
    const { degrees, rest, zero } = split(v, 36000);
    const seconds = formatNumber((rest % 600) / 10, ctx, { maxFractionDigits: 1 });
    return `${degrees}°${Math.floor(rest / 600)}'${seconds}" ${hemisphere(v, zero, axis)}`;
  });

/** Degrees and decimal minutes, minutes to 3 places (about 2 m), as GPS units show them: `40°42.768' N, 74°0.36' W`. */
export const degreesDecimalMinutes: CoordinatesFormatter = (value, ctx) =>
  both(value, (v, axis) => {
    const { degrees, rest, zero } = split(v, 60000);
    return `${degrees}°${formatNumber(rest / 1000, ctx, { maxFractionDigits: 3 })}' ${hemisphere(v, zero, axis)}`;
  });

/** A 10-digit plus code, a cell about 14 m across: `849VCWC8+R9`. Reads back as the cell's center. */
export const plusCode: CoordinatesFormatter = (value) => toPlusCode(value);

/**
 * A 9-character geohash, a cell about 4.8 m across: `dr5regw3p`. Reads back as the cell's center, in a
 * codec with the `geohash` option.
 */
export const geohash: CoordinatesFormatter = (value) => toGeohash(value, 9);
