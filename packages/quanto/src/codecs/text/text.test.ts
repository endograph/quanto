import { test } from 'vitest';
import { roundTrip, runFixtures } from '../../testing';
import fixtures from './fixtures.json';
import { text } from './index';

runFixtures(text, fixtures, { test });

const values = ['hello', 'hello world', '5\'11"', '“as typed”', '1,5'];
for (const locale of ['en-US', 'de-DE']) roundTrip(text(), values, { test, ctx: { locale } });
