// Open Location Code (plus codes): https://github.com/google/open-location-code/blob/main/Documentation/Specification/specification.md

import { assertCoordinates, type Coordinates } from './value';

const ALPHABET = '23456789CFGHJMPQRVWX';
const SEPARATOR = 8;
const PAIR_DIGITS = 10;
const MAX_DIGITS = 15;
const GRID_ROWS = 5;
const GRID_COLUMNS = 4;
/** Integer units per degree at the finest precision (15 digits), so encoding and decoding are exact. */
const LAT_UNITS = 8000 * GRID_ROWS ** 5;
const LNG_UNITS = 8000 * GRID_COLUMNS ** 5;
/** One step of each pair digit, in those units: 20°, 1°, 0.05°, 0.0025° and 0.000125°. */
const LAT_PAIR = [5e8, 2.5e7, 1.25e6, 62500, 3125];
const LNG_PAIR = [163_840_000, 8_192_000, 409_600, 20480, 1024];

/**
 * The plus code for a point: `toPlusCode({ lat: 37.4220625, lng: -122.0840625 })` is `849VCWC8+R9`.
 * `codeLength` is 2, 4, 6, 8 or 10 (pairs; shorter codes are padded, `849V0000+`) or 11 to 15 (grid
 * digits). The default, 10, is a cell of 0.000125° (about 14 m) on a side. Latitude 90 falls in the cell
 * below it and longitude 180 is -180, as the specification says.
 */
export function toPlusCode(coords: Coordinates, codeLength = 10): string {
  assertCoordinates(coords, 'toPlusCode');
  if (!Number.isInteger(codeLength) || codeLength < 2 || codeLength > MAX_DIGITS || (codeLength < PAIR_DIGITS && codeLength % 2 === 1)) {
    throw new Error(`@quantojs/geo: toPlusCode can't make a code of length ${codeLength}. Pass 2, 4, 6, 8, 10 or 11 to 15.`);
  }
  // Rounding before truncating keeps 105.994 × 8192000 from landing a hair under the integer it is.
  let lat = Math.min(Math.floor(Math.round((coords.lat + 90) * LAT_UNITS * 1e6) / 1e6), 180 * LAT_UNITS - 1);
  let lng = Math.floor(Math.round((coords.lng + 180) * LNG_UNITS * 1e6) / 1e6) % (360 * LNG_UNITS);
  let digits = '';
  if (codeLength > PAIR_DIGITS) {
    for (let i = 0; i < MAX_DIGITS - PAIR_DIGITS; i++) {
      digits = ALPHABET[(lat % GRID_ROWS) * GRID_COLUMNS + (lng % GRID_COLUMNS)]! + digits;
      lat = Math.floor(lat / GRID_ROWS);
      lng = Math.floor(lng / GRID_COLUMNS);
    }
  } else {
    lat = Math.floor(lat / GRID_ROWS ** 5);
    lng = Math.floor(lng / GRID_COLUMNS ** 5);
  }
  for (let i = 0; i < PAIR_DIGITS / 2; i++) {
    digits = ALPHABET[lat % 20]! + ALPHABET[lng % 20]! + digits;
    lat = Math.floor(lat / 20);
    lng = Math.floor(lng / 20);
  }
  if (codeLength < SEPARATOR) return `${digits.slice(0, codeLength)}${'0'.repeat(SEPARATOR - codeLength)}+`;
  return `${digits.slice(0, SEPARATOR)}+${digits.slice(SEPARATOR, codeLength)}`;
}

/** A word that looks like a plus code, full or short, valid or not: plus-code digits around a `+`. */
export const PLUS_CODE_LIKE: RegExp = /^[23456789CFGHJMPQRVWX0]{2,}\+[23456789CFGHJMPQRVWX0+]*$/i;

export type PlusCodeReading = { readonly ok: true; readonly value: Coordinates } | { readonly ok: false; readonly message: string };

/** Decodes a full plus code to the center of its area, or says what's wrong with it. Pass text that matches `PLUS_CODE_LIKE`. */
export function readPlusCode(text: string): PlusCodeReading {
  const code = text.toUpperCase();
  const invalid = (message: string): PlusCodeReading => ({ ok: false, message: `"${text}" isn't a valid plus code: ${message}` });
  const separator = code.indexOf('+');
  if (separator !== code.lastIndexOf('+')) return invalid('it has more than one "+".');
  if (separator > SEPARATOR || separator % 2 === 1) return invalid('the "+" goes after the eighth character.');
  const tail = code.slice(separator + 1);
  if (tail.includes('0')) return invalid('0 is only padding, before the "+".');
  if (tail.length === 1) return invalid('it needs at least two characters after the "+".');
  const padding = code.indexOf('0');
  if (padding >= 0) {
    if (separator < SEPARATOR || padding === 0 || !/^0+$/.test(code.slice(padding, separator)) || (separator - padding) % 2 === 1 || tail.length > 0) {
      return invalid('padding is an even run of 0s ending at the "+", with nothing after it, like 849V0000+.');
    }
  }
  if (separator < SEPARATOR) {
    return {
      ok: false,
      message: `"${text}" is a short plus code, which needs a reference location to decode. Enter the full code, like 849VCWC8+R9.`,
    };
  }
  if (ALPHABET.indexOf(code[0]!) >= 9) return invalid('its latitude is past 90°.');
  if (ALPHABET.indexOf(code[1]!) >= 18) return invalid('its longitude is past 180°.');

  const digits = (code.slice(0, padding >= 0 ? padding : separator) + tail).slice(0, MAX_DIGITS);
  let lat = 0;
  let lng = 0;
  let latStep = 0;
  let lngStep = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = ALPHABET.indexOf(digits[i]!);
    if (i < PAIR_DIGITS) {
      const k = i >> 1;
      if (i % 2 === 0) lat += d * (latStep = LAT_PAIR[k]!);
      else lng += d * (lngStep = LNG_PAIR[k]!);
    } else {
      const j = i - PAIR_DIGITS;
      latStep = GRID_ROWS ** (4 - j);
      lngStep = GRID_COLUMNS ** (4 - j);
      lat += Math.floor(d / GRID_COLUMNS) * latStep;
      lng += (d % GRID_COLUMNS) * lngStep;
    }
  }
  // The center of the area, from exact integers with one rounding, capped like the reference
  // implementation's (a cell can't reach past the pole).
  return {
    ok: true,
    value: {
      lat: Math.min((2 * lat + latStep - 180 * LAT_UNITS) / (2 * LAT_UNITS), 90),
      lng: Math.min((2 * lng + lngStep - 360 * LNG_UNITS) / (2 * LNG_UNITS), 180),
    },
  };
}
