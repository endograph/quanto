import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import type { Coordinates } from '../value';
import fixtures from './fixtures.json';
import { coordinates } from './index';

runFixtures(coordinates, fixtures, { test });

const values: Coordinates[] = [
  { lat: 40.7128, lng: -74.006 },
  { lat: -33.8688, lng: 151.2093 },
  { lat: 51.507222222222225, lng: -0.1275 },
  { lat: 37.4220625, lng: -122.0840625 },
  { lat: 0, lng: 0 },
  { lat: 90, lng: 180 },
  { lat: -90, lng: -180 },
  { lat: -0.0000004, lng: 0.0000004 },
];
/** Within the default formatter's 6 decimal places. */
const within = (places: number) => (a: Coordinates, b: Coordinates): boolean =>
  Math.abs(a.lat - b.lat) <= 0.5 * 10 ** -places + 1e-12 && Math.abs(a.lng - b.lng) <= 0.5 * 10 ** -places + 1e-12;

for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'pt-BR']) {
  for (const order of ['latLng', 'lngLat'] as const) {
    roundTrip(coordinates({ order }), values, { test, ctx: { locale }, same: within(6) });
  }
}
