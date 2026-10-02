import { expect, test } from 'vitest';
import { toGeohash } from './geohash';

// Wikipedia's examples (https://en.wikipedia.org/wiki/Geohash). Decoding is specified by the codec's fixtures.
test('57.64911, 10.40744 is u4pruydqqvj', () => expect(toGeohash({ lat: 57.64911, lng: 10.40744 }, 11)).toBe('u4pruydqqvj'));
test('42.6, -5.6 is ezs42', () => expect(toGeohash({ lat: 42.6, lng: -5.6 }, 5)).toBe('ezs42'));

test('the corners of the world', () => {
  expect(toGeohash({ lat: 90, lng: 180 }, 12)).toBe('zzzzzzzzzzzz');
  expect(toGeohash({ lat: -90, lng: -180 }, 12)).toBe('000000000000');
  expect(toGeohash({ lat: 0, lng: 0 }, 1)).toBe('s');
});

test('a shorter geohash is a prefix of a longer one', () => {
  const long = toGeohash({ lat: 40.7128, lng: -74.006 }, 12);
  for (let n = 1; n < 12; n++) expect(toGeohash({ lat: 40.7128, lng: -74.006 }, n)).toBe(long.slice(0, n));
  expect(long.startsWith('dr5regw3')).toBe(true);
});
