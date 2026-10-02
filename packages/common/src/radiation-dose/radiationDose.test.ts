import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { radiationDose } from './index';

runFixtures(radiationDose, fixtures, { test });

const values = [{ value: 2.4, unit: 'mSv' }, { value: 10, unit: 'uSv' }, { value: 1, unit: 'Sv' }, { value: 500, unit: 'mrem' }, { value: 5, unit: 'rem' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(radiationDose(), values, { test, ctx: { locale } });
