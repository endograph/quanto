import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { capacitance } from './index';

runFixtures(capacitance, fixtures, { test });

const values = [{ value: 100, unit: 'uF' }, { value: 10, unit: 'nF' }, { value: 22, unit: 'pF' }, { value: 1, unit: 'mF' }, { value: 2.5, unit: 'F' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(capacitance(), values, { test, ctx: { locale } });
