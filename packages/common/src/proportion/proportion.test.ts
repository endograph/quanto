import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { proportion } from './index';

runFixtures(proportion, fixtures, { test });

const values = [{ value: 12.5, unit: 'percent' }, { value: 5, unit: 'permille' }, { value: 25, unit: 'bp' }, { value: -50, unit: 'bp' }, { value: 420, unit: 'ppm' }, { value: 5, unit: 'ppb' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(proportion(), values, { test, ctx: { locale } });
