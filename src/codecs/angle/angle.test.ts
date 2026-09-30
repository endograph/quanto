import { test } from 'vitest';
import { roundTrip, runFixtures } from '../../testing';
import fixtures from './fixtures.json';
import { angle } from './index';

runFixtures(angle, fixtures, { test });

const values = [{ value: 45, unit: 'deg' }, { value: -12.5, unit: 'deg' }, { value: 30, unit: 'arcmin' }, { value: 15, unit: 'arcsec' }, { value: 1.5707963267948966, unit: 'rad' }, { value: 0.25, unit: 'turn' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(angle(), values, { test, ctx: { locale } });
