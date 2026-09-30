import { test } from 'vitest';
import { roundTrip, runFixtures } from '../../testing';
import fixtures from './fixtures.json';
import { area } from './index';

runFixtures(area, fixtures, { test });

const values = [{ value: 500, unit: 'ft2' }, { value: 80.5, unit: 'm2' }, { value: 2, unit: 'ac' }, { value: 1200000, unit: 'km2' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(area(), values, { test, ctx: { locale } });
