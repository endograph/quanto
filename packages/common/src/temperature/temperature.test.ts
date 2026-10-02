import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { temperature } from './index';

runFixtures(temperature, fixtures, { test });

const values = [{ value: 20, unit: 'C' }, { value: -40, unit: 'F' }, { value: 98.6, unit: 'F' }, { value: 273.15, unit: 'K' }, { value: 36.99999999999999, unit: 'C' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(temperature(), values, { test, ctx: { locale } });
