import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { current } from './index';

runFixtures(current, fixtures, { test });

const values = [{ value: 16, unit: 'A' }, { value: 500, unit: 'mA' }, { value: 20, unit: 'uA' }, { value: 5, unit: 'kA' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(current(), values, { test, ctx: { locale } });
