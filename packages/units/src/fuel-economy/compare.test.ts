// compare() and convert() across a linear unit (mpg) and a function unit (L/100km), which JSON
// fixtures can't express. The base unit is km/L, so bigger compares greater: more efficient.
import { compare, convert } from 'quanto/quantity';
import { expect, test } from 'vitest';
import { fuelEconomy } from './index';

const fe = fuelEconomy();

test('compare orders mpg against L/100km by efficiency', () => {
  // 30 mpg is about 12.75 km/L; 10 L/100km is 10 km/L; 7 L/100km is about 14.29 km/L.
  expect(compare(fe, { value: 30, unit: 'mpg' }, { value: 10, unit: 'lp100km' })).toBe(1);
  expect(compare(fe, { value: 30, unit: 'mpg' }, { value: 7, unit: 'lp100km' })).toBe(-1);
  // A lower L/100km is more efficient, so it compares greater.
  expect(compare(fe, { value: 5, unit: 'lp100km' }, { value: 10, unit: 'lp100km' })).toBe(1);
});

test('compare treats equal efficiencies in different units as equal', () => {
  // 5 L/100km is exactly 20 km/L.
  expect(compare(fe, { value: 5, unit: 'lp100km' }, { value: 20, unit: 'kmpl' })).toBe(0);
  // Round-tripping through convert lands within compare's tolerance.
  const lp100km = convert(fe, { value: 30, unit: 'mpg' }, 'lp100km');
  expect(compare(fe, { value: 30, unit: 'mpg' }, lp100km)).toBe(0);
});

test('convert throws where there is no finite result', () => {
  expect(() => convert(fe, { value: 0, unit: 'mpg' }, 'lp100km')).toThrow(/no finite result/);
});
