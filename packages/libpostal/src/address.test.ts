import { roundTrip, runFixtures } from 'quanto/testing';
import { test } from 'vitest';
import fixtures from './fixtures.json';
import { address, type Address } from './index';
import { stub } from './stub';

runFixtures((options?: { defaultCountry?: string }) => address({ ...options, libpostal: stub }), fixtures, { test });

const values: Address[] = [
  { lines: ['Hauptstraße 5'], locality: 'Berlin', postalCode: '10115', country: 'DE' },
  { lines: ['10 Downing St'], locality: 'London', postalCode: 'SW1A 2AA', country: 'GB' },
  { lines: ['Flat 2', '15 High St'], dependentLocality: 'Clifton', locality: 'Bristol', postalCode: 'BS8 1AB', country: 'GB' },
  { lines: ['1 Rue Saint-Paul'], locality: 'Montréal', region: 'QC', postalCode: 'H2Y 1G6', country: 'CA' },
  { lines: ['Via del Corso 12'], locality: 'Roma', region: 'RM', postalCode: '00186', country: 'IT' },
  { lines: ['1600 Amphitheatre Pkwy'], locality: 'Mountain View', region: 'CA', postalCode: '94043', country: 'US' },
];
roundTrip(address({ libpostal: stub }), values, { test });
roundTrip(address({ libpostal: stub, defaultCountry: 'US' }), [{ lines: ['123 Main St', 'Apt 4B'], locality: 'Springfield', region: 'IL', postalCode: '62701', country: 'US' }], { test });
