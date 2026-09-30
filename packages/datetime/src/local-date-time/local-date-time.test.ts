import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { localDateTime } from './index';

runFixtures(localDateTime, fixtures, { test });

for (const locale of ['en-US', 'en-GB', 'de-DE', 'sv-SE', 'en-CA', 'ja-JP']) roundTrip(localDateTime(), ['2026-10-02T15:00:00', '2026-01-01T00:00:00', '2026-12-31T23:59:59'], { test, ctx: { locale } });
