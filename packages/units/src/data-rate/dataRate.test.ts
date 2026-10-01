import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { dataRate } from './index';

runFixtures(dataRate, fixtures, { test });

const values = [{ value: 100, unit: 'Mbps' }, { value: 12.5, unit: 'MBps' }, { value: 56, unit: 'kbps' }, { value: 500, unit: 'kBps' }, { value: 300, unit: 'bps' }, { value: 100, unit: 'Bps' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(dataRate(), values, { test, ctx: { locale } });
