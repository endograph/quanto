import { expect, test } from 'vitest';
import { length, soundLevel, type LengthUnit } from '@quantojs/common';
import type { QuantityOptions } from '../quantity/codec';
import { roundTrip, runFixtures } from '../testing';
import lengthFixtures from './fixtures.length.json';
import openFixtures from './fixtures.length-open.json';
import soundFixtures from './fixtures.sound-level.json';
import { defineRange, range } from './index';

runFixtures((options?: QuantityOptions<LengthUnit>) => range(length(options)), lengthFixtures, { test });
runFixtures((options?: QuantityOptions<LengthUnit>) => range(length(options), { open: true }), openFixtures, { test });
runFixtures(() => range(soundLevel()), soundFixtures, { test });

for (const locale of ['en-US', 'de-DE', 'fr-FR']) {
  roundTrip(range(length()), [{ start: { value: 5, unit: 'ft' }, end: { value: 7, unit: 'ft' } }, { start: { value: -5, unit: 'm' }, end: { value: -2, unit: 'm' } }], { test, ctx: { locale } });
}

test("schema keeps each side's transformed output before the range schema", () => {
  const rounded = length({ schema: { '~standard': { version: 1, vendor: 'test', validate: (v) => ({ value: { ...(v as { value: number; unit: LengthUnit }), value: Math.round((v as { value: number }).value) } }) } } });
  const seen: unknown[] = [];
  const codec = range(rounded, { schema: { '~standard': { version: 1, vendor: 'test', validate: (v) => (seen.push(v), { value: v as never }) } } });
  const result = codec.schema['~standard'].validate({ start: { value: 1.4, unit: 'm' }, end: { value: 2.6, unit: 'm' } });
  const expected = { start: { value: 1, unit: 'm' }, end: { value: 3, unit: 'm' } };
  expect(result).toEqual({ value: expected });
  expect(seen).toEqual([expected]);
});

test('a custom format displays a range its sides\' schemas now reject, and still throws on malformed sides', () => {
  const short = length({ schema: { '~standard': { version: 1, vendor: 'test', validate: (v) => ((v as { value: number }).value > 3 ? { issues: [{ message: 'Too long.' }] } : { value: v as never }) } } });
  const codec = range(short, { format: (r) => `${r.start.value}..${r.end.value}` });
  expect(codec.format({ start: { value: 5, unit: 'm' }, end: { value: 7, unit: 'm' } })).toBe('5..7');
  expect(() => codec.format({ start: { value: 5, unit: 'm' }, end: { value: 7, unit: 'parsec' as LengthUnit } })).toThrow(/end/);
});

test('range completion can\'t read the clock', () => {
  const codec = defineRange(length(), { propose: (l, r, ctx) => [{ sides: [`${l} ${ctx.now()}`, r] }] });
  expect(() => codec.parse('5-7 ft')).toThrow(/completion .* read the clock/);
});
