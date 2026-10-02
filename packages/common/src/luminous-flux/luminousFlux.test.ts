import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { luminousFlux } from './index';

runFixtures(luminousFlux, fixtures, { test });

const values = [{ value: 800, unit: 'lm' }, { value: 2.5, unit: 'klm' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(luminousFlux(), values, { test, ctx: { locale } });
