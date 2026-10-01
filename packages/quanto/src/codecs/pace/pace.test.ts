import { range } from '../../range';
import { test } from 'vitest';
import { roundTrip, runFixtures } from '../../testing';
import fixtures from './fixtures.json';
import rangeFixtures from './fixtures.range.json';
import { pace } from './index';

runFixtures(pace, fixtures, { test });

const values = [{ value: 330, unit: 'sPerKm' }, { value: 480, unit: 'sPerMi' }, { value: 298.2581722739203, unit: 'sPerKm' }, { value: 3900, unit: 'sPerMi' }, { value: 5.5, unit: 'sPerKm' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(pace(), values, { test, ctx: { locale } });

// Pace ranges: clock notation completes like any quantity ("5:00-5:30 /km").
runFixtures(() => range(pace()), rangeFixtures, { test });
