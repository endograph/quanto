import { test } from 'vitest';
import { length, type LengthUnit } from '../codecs/length';
import type { QuantityOptions } from '../codecs/quantity';
import { roundTrip, runFixtures } from '../testing';
import lengthFixtures from './fixtures.length.json';
import { range } from './index';

runFixtures((options?: QuantityOptions<LengthUnit>) => range(length(options)), lengthFixtures, { test });

for (const locale of ['en-US', 'de-DE', 'fr-FR']) {
  roundTrip(range(length()), [{ start: { value: 5, unit: 'ft' }, end: { value: 7, unit: 'ft' } }, { start: { value: -5, unit: 'm' }, end: { value: -2, unit: 'm' } }], { test, ctx: { locale } });
}
