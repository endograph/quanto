import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { voltage } from './index';

runFixtures(voltage, fixtures, { test });

const values = [{ value: 230, unit: 'V' }, { value: 500, unit: 'mV' }, { value: 11, unit: 'kV' }, { value: 1.2, unit: 'MV' }, { value: 20, unit: 'uV' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(voltage(), values, { test, ctx: { locale } });
