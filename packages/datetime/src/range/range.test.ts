import { runFixtures } from 'quanto/testing';
import { test } from 'vitest';
import { date, dateTime, localDateTime, time } from '../index';
import { dateRange } from '../range';
import dateTimeFixtures from './fixtures.date-time.json';
import dateFixtures from './fixtures.date.json';
import localDateTimeFixtures from './fixtures.local-date-time.json';
import timeFixtures from './fixtures.time.json';

runFixtures(() => dateRange(date()), dateFixtures, { test });
runFixtures(() => dateRange(time()), timeFixtures, { test });
runFixtures(() => dateRange(localDateTime()), localDateTimeFixtures, { test });
runFixtures(() => dateRange(dateTime()), dateTimeFixtures, { test });
