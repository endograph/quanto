import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { charge } from './index';

runFixtures(charge, fixtures, { test });

const values = [{ value: 5000, unit: 'mAh' }, { value: 100, unit: 'Ah' }, { value: 3.5, unit: 'C' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(charge(), values, { test, ctx: { locale } });
