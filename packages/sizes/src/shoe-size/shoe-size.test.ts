import { test } from 'vitest';
import { quantityWithin, roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { shoeSize } from './index';

runFixtures(shoeSize, fixtures, { test });

const values = [
  { value: 10, unit: 'usMen' },
  { value: 10.5, unit: 'usMen' },
  { value: 11.070866141732292, unit: 'usMen' },
  { value: 8, unit: 'usWomen' },
  { value: 0, unit: 'uk' },
  { value: 9.5, unit: 'uk' },
  { value: 44, unit: 'eu' },
  { value: 44.666666666666664, unit: 'eu' },
  { value: 270, unit: 'mm' },
  { value: 270.93333333333334, unit: 'mm' },
  { value: 27.5, unit: 'cm' },
] as const;
for (const locale of ['en-US', 'en-GB', 'de-DE', 'ja-JP']) {
  roundTrip(shoeSize(), values, { test, ctx: { locale }, same: quantityWithin(shoeSize(), { places: 2 }) });
}
