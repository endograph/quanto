import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { resistance } from './index';

runFixtures(resistance, fixtures, { test });

const values = [{ value: 220, unit: 'ohm' }, { value: 4.7, unit: 'kohm' }, { value: 1, unit: 'Mohm' }, { value: 50, unit: 'mohm' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(resistance(), values, { test, ctx: { locale } });
