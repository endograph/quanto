import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { luminance } from './index';

runFixtures(luminance, fixtures, { test });

const values = [{ value: 1000, unit: 'nit' }, { value: 14, unit: 'fL' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(luminance(), values, { test, ctx: { locale } });
