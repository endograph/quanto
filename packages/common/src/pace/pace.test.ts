import { expect, test } from 'vitest';
import { range } from 'quanto';
import { quantityWithin, roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import rangeFixtures from './fixtures.range.json';
import { pace } from './index';

runFixtures(pace, fixtures, { test });

const values = [{ value: 330, unit: 'sPerKm' }, { value: 480, unit: 'sPerMi' }, { value: 298.2581722739203, unit: 'sPerKm' }, { value: 3900, unit: 'sPerMi' }, { value: 5.5, unit: 'sPerKm' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(pace(), values, { test, ctx: { locale }, same: quantityWithin(pace(), { places: 1 }) });

// Pace ranges: clock notation completes like any quantity ("5:00-5:30 /km").
runFixtures(() => range(pace()), rangeFixtures, { test });

// Clock notation has no negative form, so a stored negative pace is malformed rather than printed as "-6:-30 /km".
test('a negative pace fails the structural check', () => {
  const p = pace();
  expect(p.schema['~standard'].validate({ value: -330, unit: 'sPerKm' })).toMatchObject({ issues: [{ path: ['value'] }] });
  expect(() => p.format({ value: -330, unit: 'sPerKm' })).toThrow(/at least 0/);
});
