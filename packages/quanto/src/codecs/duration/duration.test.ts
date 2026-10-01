import { test } from 'vitest';
import { range } from '../../range';
import { roundTrip, runFixtures } from '../../testing';
import fixtures from './fixtures.json';
import rangeFixtures from './fixtures.range.json';
import { duration, type DurationOptions } from './index';

runFixtures(duration, fixtures, { test });
runFixtures((options?: DurationOptions) => range(duration(options)), rangeFixtures, { test });

const values = [{ value: 150, unit: 'min' }, { value: 1.5, unit: 'h' }, { value: 5415, unit: 's' }, { value: 500, unit: 'ms' }, { value: 2, unit: 'wk' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(duration(), values, { test, ctx: { locale } });
