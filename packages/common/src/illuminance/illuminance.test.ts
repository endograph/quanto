import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { illuminance } from './index';

runFixtures(illuminance, fixtures, { test });

const values = [{ value: 500, unit: 'lx' }, { value: 50, unit: 'fc' }, { value: 100, unit: 'klx' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(illuminance(), values, { test, ctx: { locale } });
