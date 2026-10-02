// Geohash: https://en.wikipedia.org/wiki/Geohash

import { assertCoordinates, type Coordinates } from './value';

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** A word of geohash characters, in either case, with at least one letter: `12345` stays a number. */
export const GEOHASH_LIKE: RegExp = /^(?=.*[b-z])[0-9b-hjkmnp-z]+$/i;

/** The fewest characters a typed geohash needs: 5 is a cell about 4.9 km across. */
export const GEOHASH_MIN_LENGTH = 5;

/**
 * The geohash of a point, `precision` characters long (1 to 12): `toGeohash({ lat: 57.64911, lng: 10.40744 }, 11)`
 * is `u4pruydqqvj`. Each character narrows the cell: 5 is about 4.9 km across, 7 about 150 m, 9 about 4.8 m,
 * 12 about 3.7 cm. A point on a cell's edge belongs to the cell north or east of it.
 */
export function toGeohash(coords: Coordinates, precision: number): string {
  assertCoordinates(coords, 'toGeohash');
  if (!Number.isInteger(precision) || precision < 1 || precision > 12) {
    throw new Error(`@quantojs/geo: toGeohash can't make a geohash of ${precision} characters. Pass a whole number from 1 to 12.`);
  }
  const lat = [-90, 90];
  const lng = [-180, 180];
  let hash = '';
  let index = 0;
  for (let bit = 0; hash.length < precision; bit++) {
    // Bits alternate, longitude first.
    const [range, value] = bit % 2 === 0 ? [lng, coords.lng] : [lat, coords.lat];
    const mid = (range[0]! + range[1]!) / 2;
    index *= 2;
    if (value >= mid) {
      index += 1;
      range[0] = mid;
    } else {
      range[1] = mid;
    }
    if (bit % 5 === 4) {
      hash += BASE32[index];
      index = 0;
    }
  }
  return hash;
}

/** The center of a geohash's cell. Pass text that matches `GEOHASH_LIKE`. */
export function readGeohash(text: string): Coordinates {
  const lat = [-90, 90];
  const lng = [-180, 180];
  let bit = 0;
  for (const char of text.toLowerCase()) {
    const index = BASE32.indexOf(char);
    for (let b = 4; b >= 0; b--, bit++) {
      const range = bit % 2 === 0 ? lng : lat;
      const mid = (range[0]! + range[1]!) / 2;
      if ((index >> b) & 1) range[0] = mid;
      else range[1] = mid;
    }
  }
  return { lat: (lat[0]! + lat[1]!) / 2, lng: (lng[0]! + lng[1]!) / 2 };
}
