import { expect, test } from 'vitest';
import { allocate, convert, roundWithMode, scale, type RoundingMode } from './operations';

const usd = (minorUnits: number) => ({ minorUnits, currency: 'USD' });

test('identity scaling and conversion preserve every safe integer digit', () => {
  for (const n of [1234567890123456, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
    expect(scale(usd(n), 1, { rounding: 'halfEven' })).toEqual(usd(n));
    expect(convert(usd(n), 'USD', { rate: 1, rounding: 'halfEven' })).toEqual(usd(n));
    expect(roundWithMode(n, 'halfEven')).toBe(n);
  }
});

const ties: [RoundingMode, number, number][] = [
  ['ceil', 1106, -1105], ['floor', 1105, -1106], ['expand', 1106, -1106],
  ['trunc', 1105, -1105], ['halfCeil', 1106, -1105], ['halfFloor', 1105, -1106],
  ['halfExpand', 1106, -1106], ['halfTrunc', 1105, -1105], ['halfEven', 1106, -1106],
];
for (const [rounding, positive, negative] of ties) {
  test(`${rounding} rounds exact decimal products, including negative ties`, () => {
    expect(scale(usd(1005), 1.1, { rounding }).minorUnits).toBe(positive);
    expect(scale(usd(-1005), 1.1, { rounding }).minorUnits).toBe(negative);
  });
}

test('rounding preserves values on either side of a tie and uses even parity', () => {
  expect(roundWithMode(2.4999999999999996, 'halfExpand')).toBe(2);
  expect(roundWithMode(2.5000000000000004, 'halfTrunc')).toBe(3);
  expect(roundWithMode(2.5, 'halfEven')).toBe(2);
  expect(roundWithMode(-2.5, 'halfEven')).toBe(-2);
  expect(scale(usd(1), Number.MIN_VALUE, { rounding: 'ceil' })).toEqual(usd(1));
  expect(scale(usd(0), Number.MAX_VALUE, { rounding: 'ceil' })).toEqual(usd(0));
  expect(() => scale(usd(Number.MAX_SAFE_INTEGER), 2, { rounding: 'trunc' })).toThrow(/too large/);
});

test('conversion applies currency minor digits before its only rounding step', () => {
  expect(convert(usd(1005), 'JPY', { rate: 110, rounding: 'halfEven' }).minorUnits).toBe(1106);
  expect(convert({ minorUnits: 9007199254740991, currency: 'BHD' }, 'USD', { rate: 1, rounding: 'trunc' }).minorUnits).toBe(900719925474099);
  expect(convert(usd(1234), 'BHD', { rate: 1, rounding: 'trunc' }).minorUnits).toBe(12340);
});

test('allocation conserves minor units with large, tiny, decimal and zero ratios', () => {
  expect(allocate(usd(1234567890123456), [1])).toEqual([usd(1234567890123456)]);
  expect(allocate(usd(100), [1e308, 1e308])).toEqual([usd(50), usd(50)]);
  expect(allocate(usd(100), [Number.MIN_VALUE, Number.MIN_VALUE])).toEqual([usd(50), usd(50)]);
  expect(allocate(usd(10), [0, 0.1, 0.2])).toEqual([usd(0), usd(4), usd(6)]);
  expect(allocate(usd(-1000), [1, 1, 1])).toEqual([usd(-334), usd(-333), usd(-333)]);
  for (const ratios of [[1, 1, 1], [Number.MAX_VALUE, Number.MIN_VALUE], [0, 0.1, 0.2]]) {
    const shares = allocate(usd(Number.MAX_SAFE_INTEGER), ratios);
    expect(shares.reduce((sum, share) => sum + BigInt(share.minorUnits), 0n)).toBe(BigInt(Number.MAX_SAFE_INTEGER));
    expect(shares.every((share) => Number.isSafeInteger(share.minorUnits))).toBe(true);
  }
});
