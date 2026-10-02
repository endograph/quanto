import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { acceleration } from './index';

runFixtures(acceleration, fixtures, { test });

const values = [{ value: 9.8, unit: 'mps2' }, { value: 32, unit: 'ftps2' }, { value: 3, unit: 'g' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(acceleration(), values, { test, ctx: { locale } });
