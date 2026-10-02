import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { torque } from './index';

runFixtures(torque, fixtures, { test });

const values = [{ value: 250, unit: 'Nm' }, { value: 184, unit: 'lbft' }, { value: 35, unit: 'lbin' }, { value: 10, unit: 'kgfm' }, { value: 2, unit: 'kNm' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(torque(), values, { test, ctx: { locale } });
