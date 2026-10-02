import { test } from 'vitest';
import { length, number, type LengthUnit } from '@quantojs/common';
import type { QuantityOptions } from '../quantity/codec';
import { roundTrip, runFixtures } from '../testing';
import lengthFixtures from './fixtures.length.json';
import numberFixtures from './fixtures.number.json';
import { dimensions, type DimensionCount } from './index';

type Options = QuantityOptions<LengthUnit> & { count?: DimensionCount };
runFixtures(({ count = 2, ...inner }: Options = {}) => dimensions(length(inner), { count }), lengthFixtures, { test });
runFixtures(({ count = 2 }: { count?: DimensionCount } = {}) => dimensions(number(), { count }), numberFixtures, { test });

for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) {
  roundTrip(dimensions(length(), { count: { min: 2 } }), [[{ value: 24, unit: 'in' }, { value: 36, unit: 'in' }], [{ value: 2, unit: 'm' }, { value: 50, unit: 'cm' }], [{ value: 2.5, unit: 'm' }, { value: 1.2, unit: 'm' }, { value: 10, unit: 'cm' }]], { test, ctx: { locale } });
  roundTrip(dimensions(number(), { count: 2 }), [[1920, 1080], [2.5, 4]], { test, ctx: { locale } });
}
