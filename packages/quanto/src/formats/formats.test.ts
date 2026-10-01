import { test } from 'vitest';
import { duration, type DurationUnit } from '../codecs/duration';
import { length, type LengthUnit } from '../codecs/length';
import { mass, type MassUnit } from '../codecs/mass';
import type { QuantityOptions } from '../codecs/quantity';
import { quantityWithin, roundTrip, runFixtures } from '../testing';
import feetInchesFixtures from './fixtures.feet-inches.json';
import hoursMinutesFixtures from './fixtures.hours-minutes.json';
import poundsOuncesFixtures from './fixtures.pounds-ounces.json';
import stonesPoundsFixtures from './fixtures.stones-pounds.json';
import { feetInches, hoursMinutes, poundsOunces, stonesPounds } from './index';

// The compound formatters are specified through the codecs they're meant for.
runFixtures((options?: QuantityOptions<LengthUnit>) => length({ ...options, format: feetInches }), feetInchesFixtures, { test });
runFixtures((options?: QuantityOptions<MassUnit>) => mass({ ...options, format: poundsOunces }), poundsOuncesFixtures, { test });
runFixtures((options?: QuantityOptions<MassUnit>) => mass({ ...options, format: stonesPounds }), stonesPoundsFixtures, { test });
runFixtures((options?: QuantityOptions<DurationUnit>) => duration({ ...options, format: hoursMinutes }), hoursMinutesFixtures, { test });

// Each rounds its smallest part to a whole number.
for (const locale of ['en-US', 'de-DE', 'fr-FR']) {
  const ctx = { locale };
  roundTrip(length({ format: feetInches }), [{ value: 71, unit: 'in' }, { value: 180, unit: 'cm' }, { value: -66, unit: 'in' }], { test, ctx, same: quantityWithin(length(), { unit: 'in', places: 0 }) });
  roundTrip(mass({ format: poundsOunces }), [{ value: 20, unit: 'oz' }, { value: 1, unit: 'kg' }], { test, ctx, same: quantityWithin(mass(), { unit: 'oz', places: 0 }) });
  roundTrip(mass({ format: stonesPounds }), [{ value: 158, unit: 'lb' }, { value: 70, unit: 'kg' }], { test, ctx, same: quantityWithin(mass(), { unit: 'lb', places: 0 }) });
  roundTrip(duration({ format: hoursMinutes }), [{ value: 150, unit: 'min' }, { value: 5415, unit: 's' }], { test, ctx, same: quantityWithin(duration(), { unit: 'min', places: 0 }) });
}
