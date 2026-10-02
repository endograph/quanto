import { test } from 'vitest';
import { quantityWithin, roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { fuelEconomy } from './index';

runFixtures(fuelEconomy, fixtures, { test });

const values = [{ value: 30, unit: 'mpg' }, { value: 40, unit: 'mpgImp' }, { value: 7.840486111111111, unit: 'lp100km' }, { value: 15, unit: 'kmpl' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(fuelEconomy(), values, { test, ctx: { locale }, same: quantityWithin(fuelEconomy(), { places: 2 }) });
