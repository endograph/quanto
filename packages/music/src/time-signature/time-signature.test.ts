import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { timeSignature } from './index';

runFixtures(timeSignature, fixtures, { test });

roundTrip(timeSignature(), [{ numerator: 4, denominator: 4 }, { numerator: 6, denominator: 8 }, { numerator: 7, denominator: 8, groups: [3, 2, 2] }], { test });
