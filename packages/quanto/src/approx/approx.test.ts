import { test } from 'vitest';
import { length, type LengthUnit } from '../codecs/length';
import type { QuantityOptions } from '../codecs/quantity';
import { city } from '../core/stub';
import { range } from '../range';
import { runFixtures } from '../testing';
import cityFixtures from './fixtures.city.json';
import lengthFixtures from './fixtures.length.json';
import rangeFixtures from './fixtures.range-length.json';
import { approx } from './index';

runFixtures((options?: QuantityOptions<LengthUnit>) => approx(length(options)), lengthFixtures, { test });
runFixtures((options?: QuantityOptions<LengthUnit>) => approx(range(length(options))), rangeFixtures, { test });
runFixtures(() => approx(city()), cityFixtures, { test });
