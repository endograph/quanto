import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { soundLevel } from './index';

runFixtures(soundLevel, fixtures, { test });

const values = [{ value: 85, unit: 'dB' }, { value: 70, unit: 'dBA' }, { value: 100, unit: 'dBC' }, { value: 2, unit: 'Pa' }, { value: -10, unit: 'dB' }] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(soundLevel(), values, { test, ctx: { locale } });
