import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { flowRate } from './index';

runFixtures(flowRate, fixtures, { test });

const values = [{ value: 12, unit: 'Lpmin' }, { value: 5, unit: 'm3ph' }, { value: 2.5, unit: 'gpm' }, { value: 400, unit: 'cfm' }, { value: 125, unit: 'mLph' }, { value: 1000, unit: 'cfs' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(flowRate(), values, { test, ctx: { locale } });
