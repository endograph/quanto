import { test } from 'vitest';
import { dataSize, length, number, type LengthUnit } from '@quantojs/common';
import { merge } from '../merge';
import type { QuantityOptions } from '../quantity/codec';
import { roundTrip, runFixtures } from '../testing';
import lengthFixtures from './fixtures.length.json';
import mergeFixtures from './fixtures.merge.json';
import numberFixtures from './fixtures.number.json';
import { infinite, type InfiniteOptions } from './index';

runFixtures((options?: QuantityOptions<LengthUnit>) => infinite(length(options)), lengthFixtures, { test });
runFixtures(() => infinite(merge([length(), dataSize()])), mergeFixtures, { test });
runFixtures((options?: InfiniteOptions<number>) => infinite(number(), options), numberFixtures, { test });

roundTrip(infinite(length()), [{ infinite: 1 }, { infinite: -1 }, { infinite: 1, unit: 'ft' }, { infinite: -1, unit: 'ly' }, { value: 5, unit: 'ft' }], { test });
roundTrip(
  infinite(merge([length(), dataSize()])),
  [{ infinite: 1 }, { codec: 'dataSize', value: { infinite: 1, unit: 'GB' } }, { codec: 'length', value: { infinite: -1 } }, { codec: 'length', value: { value: 5, unit: 'ft' } }],
  { test },
);
roundTrip(infinite(number(), { words: { positive: ['never'], negative: ['always'] } }), [{ infinite: 1 }, { infinite: -1 }, 12], { test });
