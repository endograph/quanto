import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { compute } from './index';

runFixtures(compute, fixtures, { test });

const values = [{ value: 1000, unit: 'FLOP' }, { value: 3.8e25, unit: 'FLOP' }, { value: 2.5, unit: 'TFLOP' }, { value: 21, unit: 'ZFLOP' }, { value: 3640, unit: 'pfsDay' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(compute(), values, { test, ctx: { locale } });
