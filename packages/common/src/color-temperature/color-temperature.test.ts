import { test } from 'vitest';
import { quantityWithin, roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { colorTemperature } from './index';

runFixtures(colorTemperature, fixtures, { test });

const values = [{ value: 2700, unit: 'K' }, { value: 6500.25, unit: 'K' }, { value: 153, unit: 'mired' }, { value: 153.84615384615384, unit: 'mired' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) {
  roundTrip(colorTemperature(), values, { test, ctx: { locale }, same: quantityWithin(colorTemperature(), { places: 2 }) });
}
