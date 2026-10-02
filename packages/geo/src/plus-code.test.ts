import { expect, test } from 'vitest';
import { toPlusCode } from './plus-code';

// Rows from the Open Location Code repository's test data (test_data/encoding.csv): latitude, longitude,
// code length, code. Decoding is specified by the codec's fixtures.
const ENCODING: ReadonlyArray<readonly [number, number, number, string]> = [
  [20.375, 2.775, 6, '7FG49Q00+'],
  [20.3700625, 2.7821875, 10, '7FG49QCJ+2V'],
  [20.3701125, 2.782234375, 11, '7FG49QCJ+2VX'],
  [20.3701135, 2.78223535156, 13, '7FG49QCJ+2VXGJ'],
  [47.0000625, 8.0000625, 10, '8FVC2222+22'],
  [-41.2730625, 174.7859375, 10, '4VCPPQGP+Q9'],
  [0.5, -179.5, 4, '62G20000+'],
  [-89.5, -179.5, 4, '22220000+'],
  [20.5, 2.5, 4, '7FG40000+'],
  [-89.9999375, -179.9999375, 10, '22222222+22'],
  [0.5, 179.5, 4, '6VGX0000+'],
  [1, 1, 11, '6FH32222+222'],
  [90, 1, 4, 'CFX30000+'],
  [1, 180, 4, '62H20000+'],
];

for (const [lat, lng, length, code] of ENCODING) {
  test(`toPlusCode(${lat}, ${lng}, ${length}) is ${code}`, () => expect(toPlusCode({ lat, lng }, length)).toBe(code));
}

test("Google's Mountain View office is 849VCWC8+R9", () => expect(toPlusCode({ lat: 37.4220625, lng: -122.0840625 })).toBe('849VCWC8+R9'));

test('every length is a prefix of the 15-digit code', () => {
  const full = toPlusCode({ lat: 40.689247, lng: -74.044502 }, 15);
  expect(full).toMatch(/^87G7MXQ4\+[23456789CFGHJMPQRVWX]{7}$/);
  for (const length of [8, 10, 11, 12, 13, 14]) expect(full.startsWith(toPlusCode({ lat: 40.689247, lng: -74.044502 }, length))).toBe(true);
});
