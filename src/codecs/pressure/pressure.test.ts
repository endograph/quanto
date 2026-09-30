import { test } from 'vitest';
import { roundTrip, runFixtures } from '../../testing';
import fixtures from './fixtures.json';
import { pressure } from './index';

runFixtures(pressure, fixtures, { test });

const values = [{ value: 32, unit: 'psi' }, { value: 2.2, unit: 'bar' }, { value: 1013.25, unit: 'hPa' }, { value: 120, unit: 'mmHg' }, { value: 29.92, unit: 'inHg' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(pressure(), values, { test, ctx: { locale } });
