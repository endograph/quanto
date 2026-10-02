import { test } from 'vitest';
import { runFixtures } from 'quanto/testing';
import { phoneNumber } from '../phone';
import fixtures from './fixtures.json';
import phoneFixtures from './fixtures.phone.json';
import { anything } from './index';

runFixtures(anything, fixtures, { test });
runFixtures(() => anything({ include: [phoneNumber()] }), phoneFixtures, { test });
