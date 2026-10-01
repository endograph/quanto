import { test } from 'vitest';
import { duration } from '../codecs/duration';
import { length } from '../codecs/length';
import { text } from '../codecs/text';
import { city } from '../core/stub';
import { roundTrip, runFixtures } from '../testing';
import cityLengthFixtures from './fixtures.city-length.json';
import cityTextFixtures from './fixtures.city-text.json';
import fixtures from './fixtures.length-duration.json';
import { merge } from './index';

runFixtures(() => merge([length(), duration()]), fixtures, { test });
runFixtures(() => merge([text(), city()]), cityTextFixtures, { test });
runFixtures(() => merge([city(), length()]), cityLengthFixtures, { test });

const values = [
  { codec: 'length', value: { value: 5, unit: 'ft' } },
  { codec: 'duration', value: { value: 90, unit: 'min' } },
];
roundTrip(merge([length(), duration()]), values, { test });
