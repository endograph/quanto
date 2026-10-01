import { test } from 'vitest';
import { roundTrip, runFixtures } from '../../testing';
import externalFixtures from './fixtures.external.json';
import fixtures from './fixtures.json';
import { city, externalCity, type City } from './index';

runFixtures(city, fixtures, { test });
runFixtures(externalCity, externalFixtures, { test });

const values: City[] = [{ name: 'Chicago', region: 'IL' }, { name: 'Springfield', region: 'MO' }];
roundTrip(city(), values, { test });
roundTrip(externalCity(), values, { test });
