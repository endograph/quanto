import { test } from 'vitest';
import { quantityWithin, roundTrip, runFixtures } from '../../testing';
import fixtures from './fixtures.json';
import { volume } from './index';

runFixtures(volume, fixtures, { test });

const values = [{ value: 500, unit: 'ml' }, { value: 1.5, unit: 'l' }, { value: 2, unit: 'm3' }, { value: 12, unit: 'floz' }, { value: 3.785411784, unit: 'l' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(volume(), values, { test, ctx: { locale }, same: quantityWithin(volume(), { places: 2 }) });
