import { test } from 'vitest';
import { roundTrip, runFixtures } from '../../testing';
import fixtures from './fixtures.json';
import { frequency } from './index';

runFixtures(frequency, fixtures, { test });

const values = [{ value: 440, unit: 'Hz' }, { value: 2.4, unit: 'GHz' }, { value: 101.1, unit: 'MHz' }, { value: 3000, unit: 'rpm' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(frequency(), values, { test, ctx: { locale } });
