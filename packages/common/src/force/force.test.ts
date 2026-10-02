import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { force } from './index';

runFixtures(force, fixtures, { test });

const values = [{ value: 500, unit: 'N' }, { value: 100, unit: 'lbf' }, { value: 50, unit: 'kgf' }, { value: 8, unit: 'ozf' }, { value: 100, unit: 'dyn' }, { value: 1.5, unit: 'MN' }, { value: 5, unit: 'mN' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(force(), values, { test, ctx: { locale } });
