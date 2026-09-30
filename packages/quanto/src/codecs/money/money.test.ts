import { test } from 'vitest';
import { roundTrip, runFixtures } from '../../testing';
import fixtures from './fixtures.json';
import { money } from './index';

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
