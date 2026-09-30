import { test } from 'vitest';
import { roundTrip, runFixtures } from '../../testing';
import fixtures from './fixtures.json';
import { dataRate } from './index';

runFixtures(dataRate, fixtures, { test });

const values = [{ value: 100, unit: 'Mbit/s' }, { value: 12.5, unit: 'MB/s' }, { value: 56, unit: 'kbit/s' }, { value: 500, unit: 'kB/s' }, { value: 300, unit: 'bit/s' }, { value: 100, unit: 'B/s' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(dataRate(), values, { test, ctx: { locale } });
