import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { date } from './index';

runFixtures(date, fixtures, { test });

for (const locale of ['en-US', 'en-GB', 'de-DE', 'sv-SE', 'en-CA', 'ja-JP']) roundTrip(date(), ['2026-10-02', '1999-12-31', '2028-02-29', '0999-01-05'], { test, ctx: { locale } });
