import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { density } from './index';

runFixtures(density, fixtures, { test });

const values = [{ value: 1000, unit: 'kgpm3' }, { value: 7.85, unit: 'gpcm3' }, { value: 35, unit: 'gpL' }, { value: 0.8, unit: 'kgpL' }, { value: 62.4, unit: 'lbpft3' }, { value: 0.28, unit: 'lbpin3' }, { value: 8.34, unit: 'lbpgal' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(density(), values, { test, ctx: { locale } });
