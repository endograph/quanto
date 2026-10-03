import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { dateOffset } from './index';

runFixtures(dateOffset, fixtures, { test });

for (const locale of ['en-US', 'de-DE', 'fr-FR', 'en-IN']) roundTrip(dateOffset(), ['P3D', '-P3D', 'P0D', 'P1W2D', '-P1Y6M2W3D', 'P12000D'], { test, ctx: { locale } });
