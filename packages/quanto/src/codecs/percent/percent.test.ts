import { test } from 'vitest';
import { roundTrip, runFixtures } from '../../testing';
import fixtures from './fixtures.json';
import { percent } from './index';

runFixtures(percent, fixtures, { test });

const values = [0, 12.5, -3, 100, 0.5, 33.333333333333336, 1234.5];
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(percent(), values, { test, ctx: { locale }, same: (a, b) => Math.abs(a - b) <= 0.005 });
