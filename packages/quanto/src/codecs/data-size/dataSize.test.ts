import { test } from 'vitest';
import { roundTrip, runFixtures } from '../../testing';
import fixtures from './fixtures.json';
import { dataSize } from './index';

runFixtures(dataSize, fixtures, { test });

const values = [{ value: 500, unit: 'MB' }, { value: 1.5, unit: 'GB' }, { value: 4, unit: 'GiB' }, { value: 1073.741824, unit: 'MB' }, { value: 100, unit: 'B' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(dataSize(), values, { test, ctx: { locale } });
