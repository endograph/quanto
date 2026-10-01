import { test } from 'vitest';
import { roundTrip, runFixtures } from '../../testing';
import fixtures from './fixtures.json';
import rangeFixtures from './fixtures.range.json';
import { moneyRange } from '../range';
import { money, type MoneyOptions } from './index';

runFixtures(money, fixtures, { test });

const values = [
  { minorUnits: 1234, currency: 'USD' },
  { minorUnits: -1234, currency: 'USD' },
  { minorUnits: 0, currency: 'USD' },
  { minorUnits: 123456789, currency: 'EUR' },
  { minorUnits: 1500, currency: 'JPY' },
  { minorUnits: 1234, currency: 'BHD' },
  { minorUnits: 1500000, currency: 'KWD' },
  { minorUnits: 15000000, currency: 'INR' },
  { minorUnits: 1234, currency: 'CAD' },
  { minorUnits: 1234, currency: 'CNY' },
  { minorUnits: 1234, currency: 'SEK' },
  { minorUnits: 1234, currency: 'CHF' },
];
for (const locale of ['en-US', 'en-CA', 'de-DE', 'fr-FR', 'de-CH', 'en-IN', 'zh-CN', 'sv-SE', 'pt-BR', 'id-ID']) {
  roundTrip(money(), values, { test, ctx: { locale } });
}

// Ranges: currency and magnitude borrowing.
runFixtures((options?: MoneyOptions) => moneyRange(money(options)), rangeFixtures, { test });
for (const locale of ['en-US', 'de-DE', 'fr-FR']) {
  roundTrip(moneyRange(money()), [{ start: { minorUnits: 1000, currency: 'USD' }, end: { minorUnits: 2000000, currency: 'USD' } }], { test, ctx: { locale } });
}
