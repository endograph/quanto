import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { computeRate } from './index';

runFixtures(computeRate, fixtures, { test });

const values = [{ value: 989, unit: 'TFLOPS' }, { value: 1.2, unit: 'EFLOPS' }, { value: 3e14, unit: 'FLOPS' }, { value: 5, unit: 'kFLOPS' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(computeRate(), values, { test, ctx: { locale } });
