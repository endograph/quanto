import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import type { Odds } from '../types';
import fixtures from './fixtures.json';
import { odds } from './index';

runFixtures(odds, fixtures, { test });

const values: Odds[] = [
  { kind: 'fractional', numerator: 5, denominator: 1 },
  { kind: 'fractional', numerator: 100, denominator: 30 },
  { kind: 'fractional', numerator: 1, denominator: 2 },
  { kind: 'decimal', value: 3.75 },
  { kind: 'decimal', value: 1.01 },
  { kind: 'american', value: 500 },
  { kind: 'american', value: -110 },
  { kind: 'american', value: 1000 },
];
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) roundTrip(odds(), values, { test, ctx: { locale } });
