import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { dateTime } from './index';

runFixtures(dateTime, fixtures, { test });

for (const locale of ['en-US', 'en-GB', 'de-DE', 'sv-SE', 'en-CA', 'ja-JP']) roundTrip(dateTime(), ['2026-10-02T15:00:00-04:00', '2026-10-02T15:00:00+00:00', '2026-01-01T00:30:00+05:30'], { test, ctx: { locale } });
