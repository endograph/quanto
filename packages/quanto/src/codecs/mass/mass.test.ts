import { test } from 'vitest';
import { quantityWithin, roundTrip, runFixtures } from '../../testing';
import fixtures from './fixtures.json';
import { mass } from './index';

runFixtures(mass, fixtures, { test });

const values = [{ value: 70, unit: 'kg' }, { value: 20, unit: 'oz' }, { value: 154.3235835294143, unit: 'lb' }, { value: 11, unit: 'st' }, { value: 0.5, unit: 't' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(mass(), values, { test, ctx: { locale }, same: quantityWithin(mass(), { places: 3 }) });
