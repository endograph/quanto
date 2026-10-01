import { test } from 'vitest';
import { quantityWithin, roundTrip, runFixtures } from '../../testing';
import fixtures from './fixtures.json';
import { speed } from './index';

runFixtures(speed, fixtures, { test });

const values = [{ value: 60, unit: 'mph' }, { value: 96.56064, unit: 'kmh' }, { value: 10, unit: 'mps' }, { value: 20, unit: 'kn' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(speed(), values, { test, ctx: { locale }, same: quantityWithin(speed(), { places: 2 }) });
