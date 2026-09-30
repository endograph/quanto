import { test } from 'vitest';
import { date, dateTime, localDateTime, time } from '../codecs/calendar/codecs';
import { length, type LengthUnit } from '../codecs/length';
import { money, type MoneyOptions } from '../codecs/money';
import type { QuantityOptions } from '../codecs/quantity';
import { roundTrip, runFixtures } from '../testing';
import lengthFixtures from './fixtures.length.json';
import dateTimeFixtures from './fixtures.date-time.json';
import dateFixtures from './fixtures.date.json';
import localDateTimeFixtures from './fixtures.local-date-time.json';
import moneyFixtures from './fixtures.money.json';
import timeFixtures from './fixtures.time.json';
import { range } from './index';

runFixtures((options?: QuantityOptions<LengthUnit>) => range(length(options)), lengthFixtures, { test });
runFixtures((options?: MoneyOptions) => range(money(options)), moneyFixtures, { test });
runFixtures(() => range(date()), dateFixtures, { test });
runFixtures(() => range(time()), timeFixtures, { test });
runFixtures(() => range(localDateTime()), localDateTimeFixtures, { test });
runFixtures(() => range(dateTime()), dateTimeFixtures, { test });

for (const locale of ['en-US', 'de-DE', 'fr-FR']) {
  roundTrip(range(length()), [{ start: { value: 5, unit: 'ft' }, end: { value: 7, unit: 'ft' } }, { start: { value: -5, unit: 'm' }, end: { value: -2, unit: 'm' } }], { test, ctx: { locale } });
  roundTrip(range(money()), [{ start: { minorUnits: 1000, currency: 'USD' }, end: { minorUnits: 2000000, currency: 'USD' } }], { test, ctx: { locale } });
}
