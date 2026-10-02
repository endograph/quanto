import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { absorbedDose } from './index';

runFixtures(absorbedDose, fixtures, { test });

const values = [{ value: 2, unit: 'Gy' }, { value: 180, unit: 'cGy' }, { value: 20, unit: 'mGy' }, { value: 50, unit: 'rad' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(absorbedDose(), values, { test, ctx: { locale } });
