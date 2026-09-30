import { test } from 'vitest';
import { duration } from '../codecs/duration';
import { length } from '../codecs/length';
import { roundTrip, runFixtures } from '../testing';
import fixtures from './fixtures.length-duration.json';
import { merge } from './index';

runFixtures(() => merge([length(), duration()]), fixtures, { test });

const values = [
  { codec: 'length', value: { value: 5, unit: 'ft' } },
  { codec: 'duration', value: { value: 90, unit: 'min' } },
];
roundTrip(merge([length(), duration()]), values, { test });
