import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { time } from './index';

runFixtures(time, fixtures, { test });

for (const locale of ['en-US', 'en-GB', 'de-DE', 'sv-SE', 'en-CA', 'ja-JP']) roundTrip(time(), ['15:00:00', '00:00:00', '12:00:00', '09:05:30', '23:59:59'], { test, ctx: { locale } });
