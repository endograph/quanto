import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { ratio } from './index';

runFixtures(ratio, fixtures, { test });

const values = [[16, 9], [2.39, 1], [1, 2, 4], [1, 1000], [0, 1]];
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(ratio(), values, { test, ctx: { locale } });
