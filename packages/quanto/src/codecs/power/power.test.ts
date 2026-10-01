import { test } from 'vitest';
import { quantityWithin, roundTrip, runFixtures } from '../../testing';
import fixtures from './fixtures.json';
import { power } from './index';

runFixtures(power, fixtures, { test });

const values = [{ value: 5, unit: 'mW' }, { value: 5, unit: 'MW' }, { value: 150, unit: 'hp' }, { value: 111.85498073734054, unit: 'kW' }, { value: 12000, unit: 'BTUh' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(power(), values, { test, ctx: { locale }, same: quantityWithin(power(), { places: 3 }) });
