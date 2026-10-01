import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { energy } from './index';

runFixtures(energy, fixtures, { test });

const values = [{ value: 2000, unit: 'kcal' }, { value: 3.5, unit: 'kWh' }, { value: 4.184, unit: 'kJ' }, { value: 1000, unit: 'BTU' }, { value: 5, unit: 'J' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(energy(), values, { test, ctx: { locale } });
