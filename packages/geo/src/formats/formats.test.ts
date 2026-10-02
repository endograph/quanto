import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import { coordinates, type CoordinatesOptions } from '../coordinates';
import type { Coordinates } from '../value';
import decimalMinutesFixtures from './fixtures.degrees-decimal-minutes.json';
import dmsFixtures from './fixtures.degrees-minutes-seconds.json';
import geohashFixtures from './fixtures.geohash.json';
import plusCodeFixtures from './fixtures.plus-code.json';
import { degreesDecimalMinutes, degreesMinutesSeconds, geohash, plusCode } from './index';

// The formatters are specified through the codec they're for.
runFixtures((options?: CoordinatesOptions) => coordinates({ ...options, format: degreesMinutesSeconds }), dmsFixtures, { test });
runFixtures((options?: CoordinatesOptions) => coordinates({ ...options, format: degreesDecimalMinutes }), decimalMinutesFixtures, { test });
runFixtures((options?: CoordinatesOptions) => coordinates({ ...options, format: plusCode }), plusCodeFixtures, { test });
runFixtures((options?: CoordinatesOptions) => coordinates({ ...options, format: geohash }), geohashFixtures, { test });

const values: Coordinates[] = [
  { lat: 40.7128, lng: -74.006 },
  { lat: -33.8688, lng: 151.2093 },
  { lat: 51.507222222222225, lng: -0.1275 },
  { lat: 0, lng: 0 },
  { lat: 89.99999, lng: -179.99999 },
  { lat: -90, lng: 180 },
];
/** Within `lat` and `lng` degrees of each other. */
const within = (lat: number, lng = lat) => (a: Coordinates, b: Coordinates): boolean =>
  Math.abs(a.lat - b.lat) <= lat + 1e-12 && (Math.abs(a.lng - b.lng) <= lng + 1e-12 || Math.abs(Math.abs(a.lng - b.lng) - 360) <= lng + 1e-12);

for (const locale of ['en-US', 'de-DE', 'fr-FR']) {
  const ctx = { locale };
  roundTrip(coordinates({ format: degreesMinutesSeconds }), values, { test, ctx, same: within(0.05 / 3600) });
  roundTrip(coordinates({ format: degreesDecimalMinutes }), values, { test, ctx, same: within(0.0005 / 60) });
}
// A plus code or geohash reads back as its cell's center: half a cell from the original at most.
roundTrip(coordinates({ format: plusCode }), values, { test, same: within(0.000125 / 2) });
roundTrip(coordinates({ format: geohash, geohash: true }), values, { test, same: within(180 / 2 ** 22 / 2, 360 / 2 ** 23 / 2) });
