import { test } from 'vitest';
import { quantityWithin, roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { ringSize } from './index';

runFixtures(ringSize, fixtures, { test });

const values = [
  { value: 7, unit: 'us' },
  { value: 7.25, unit: 'us' },
  { value: 0, unit: 'us' },
  { value: 6.835056414769558, unit: 'us' },
  { value: 14, unit: 'uk' },
  { value: 14.5, unit: 'uk' },
  { value: 1, unit: 'uk' },
  { value: 26.5, unit: 'uk' },
  { value: 28, unit: 'uk' },
  { value: 54, unit: 'eu' },
  { value: 54.421181219605266, unit: 'eu' },
  { value: 14, unit: 'ch' },
  { value: 17.3, unit: 'diameter' },
] as const;
for (const locale of ['en-US', 'en-GB', 'de-DE', 'fr-FR']) {
  roundTrip(ringSize(), values, { test, ctx: { locale }, same: quantityWithin(ringSize(), { places: 2 }) });
}
