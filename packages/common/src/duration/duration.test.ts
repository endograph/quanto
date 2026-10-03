import { test } from 'vitest';
import { range } from 'quanto';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import approximateFixtures from './fixtures.approximate.json';
import rangeFixtures from './fixtures.range.json';
import { approximateDuration, duration, type DurationOptions } from './index';

runFixtures(duration, fixtures, { test });
runFixtures(approximateDuration, approximateFixtures, { test });
runFixtures((options?: DurationOptions) => range(duration(options)), rangeFixtures, { test });

const values = [{ value: 150, unit: 'min' }, { value: 1.5, unit: 'h' }, { value: 5415, unit: 's' }, { value: 500, unit: 'ms' }, { value: 2, unit: 'wk' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(duration(), values, { test, ctx: { locale } });

const approximateValues = [
  { value: { value: 3, unit: 'mo' }, approximate: true },
  { value: { value: 1.5, unit: 'yr' }, approximate: true },
  { value: { value: 90, unit: 'min' }, approximate: false },
  { value: { value: 90, unit: 'min' }, approximate: true },
] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR']) roundTrip(approximateDuration(), approximateValues, { test, ctx: { locale } });
