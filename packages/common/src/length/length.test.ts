import { test } from 'vitest';
import { quantityWithin, roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { length } from './index';

runFixtures(length, fixtures, { test });

const values = [
  { value: 71, unit: 'in' },
  { value: 1.8, unit: 'm' },
  { value: 1500, unit: 'm' },
  { value: 180.34, unit: 'cm' },
  { value: 70.86614173228347, unit: 'in' },
  { value: -5, unit: 'ft' },
  { value: 0.5, unit: 'mi' },
] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(length(), values, { test, ctx: { locale }, same: quantityWithin(length(), { places: 2 }) });
