import { expect, test } from 'vitest';
import { defineCodec, defineExternalCodec, type CodecOptions } from 'quanto';
import { initialState, reduce } from './field';
import { initialExternalState, reduceExternal } from './external-field';

function roundingSchema(): { options: CodecOptions<number>; calls: () => number } {
  let count = 0;
  return {
    calls: () => count,
    options: {
      schema: {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate(value) {
            count++;
            if (typeof value !== 'number') return { issues: [{ message: 'Expected a number.' }] };
            return value > 10 ? { issues: [{ message: 'Too large.' }] } : { value: Math.round(value) };
          },
        },
      },
    },
  };
}

test('sync alternatives reuse validation, including undo; arbitrary choices and picks validate', () => {
  const schema = roundingSchema();
  const codec = defineCodec<number>({
    id: 'rounded', check: () => [], format: String, options: schema.options,
    parse: () => ({ ok: true, value: 1.2, alternatives: [2.2] }),
  });
  const env = { codec, display: 'raw' as const };
  let state = reduce(env, initialState(env), { type: 'input', raw: 'one or two' }).state;
  state = reduce(env, state, { type: 'enter' }).state;
  const parsedCalls = schema.calls();
  let result = reduce(env, state, { type: 'choose', value: 2 });
  expect(result.commit?.value).toEqual({ raw: 'one or two', value: 2 });
  result = reduce(env, result.state, { type: 'choose', value: 1 });
  expect(result.commit?.value).toEqual({ raw: 'one or two', value: 1 });
  expect(schema.calls()).toBe(parsedCalls);
  result = reduce(env, result.state, { type: 'choose', value: 3.6 });
  expect(result.commit?.value).toEqual({ raw: 'one or two', value: 4 });
  expect(schema.calls()).toBe(parsedCalls + 1);
  result = reduce(env, result.state, { type: 'pick', value: 20 });
  expect(result.commit?.value).toMatchObject({ issues: [{ code: 'invalid' }] });
  expect(schema.calls()).toBe(parsedCalls + 2);
});

test('external known choices reuse validation; lazy results and arbitrary choices still validate', async () => {
  const schema = roundingSchema();
  const codec = defineExternalCodec<number>({
    id: 'rounded', check: () => [], format: String, options: schema.options,
    parse: async () => ({ ok: true, value: 1.2, alternatives: [2.2] }),
    complete: async () => [{ label: 'known', value: 2.2 }, { label: 'lazy', resolve: async () => 2.2 }],
  });
  const env = { codec, display: 'raw' as const, completions: true };
  const candidates = await codec.complete!('two');
  const state = { ...initialExternalState(env), raw: 'two', completions: candidates };
  const completedCalls = schema.calls();
  const known = reduceExternal(env, state, { type: 'select', index: 0 });
  expect(known.commit?.value).toEqual({ raw: '2', value: 2 });
  expect(schema.calls()).toBe(completedCalls);

  const fetching = reduceExternal(env, state, { type: 'select', index: 1 });
  const lazy = candidates[1]!;
  if ('value' in lazy) throw new Error('Expected a lazy completion.');
  const picked = reduceExternal(env, fetching.state, { type: 'picked', id: fetching.resolve!.id, value: await lazy.resolve() });
  expect(picked.commit?.value).toEqual(known.commit?.value);
  expect(schema.calls()).toBe(completedCalls + 1);

  const parsed = await codec.parse('one or two');
  const committed = reduceExternal(env, { ...initialExternalState(env), raw: 'one or two', pending: { id: 1, trigger: 'enter' } }, { type: 'resolved', id: 1, result: parsed });
  const parsedCalls = schema.calls();
  let chosen = reduceExternal(env, committed.state, { type: 'choose', value: 2 });
  expect(chosen.commit?.value).toEqual({ raw: 'one or two', value: 2 });
  chosen = reduceExternal(env, chosen.state, { type: 'choose', value: 1 });
  expect(schema.calls()).toBe(parsedCalls);
  chosen = reduceExternal(env, chosen.state, { type: 'choose', value: 3.6 });
  expect(chosen.commit?.value).toEqual({ raw: 'one or two', value: 4 });
  const invalid = reduceExternal(env, chosen.state, { type: 'pick', value: 20 });
  expect(invalid.commit?.value).toMatchObject({ issues: [{ code: 'invalid' }] });
  expect(schema.calls()).toBe(parsedCalls + 2);
});
