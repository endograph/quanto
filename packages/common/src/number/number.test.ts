import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { number } from './index';

runFixtures(number, fixtures, { test });

const values = [0, 12, -3, 1234.5, 0.5, 6.02e23, 1234567];
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(number(), values, { test, ctx: { locale } });
