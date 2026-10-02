// Runs the external field's scripted fixtures: events in; the text, requests, aborts, commits, issues,
// pending, failed and the completion list out. `resolve` runs a request's text through the codec and
// `reject` fails it; `complete` and `failComplete` do the same for completion requests, and `fetch` and
// `failFetch` for a chosen completion's value.
import { expect, test } from 'vitest';
import { defineExternalCodec, optional, parseFromCompletions, type CodecOptions, type Completion, type ExternalCodec, type QuantoValue } from 'quanto';
import { length } from '@quantojs/common';
import fixtures from './fixtures.json';
import { entries, initialExternalState, isOpen, reduceExternal, type ExternalFieldEnv, type ExternalFieldEvent, type ExternalTransition } from './index';
import type { Display } from '../field';

/** A stub external length codec: its "service" is the sync length codec. */
const externalLength = (options?: CodecOptions<unknown>): ExternalCodec<unknown> => {
  const local = length();
  return defineExternalCodec<unknown>({
    id: 'length',
    parse: async (text, ctx) => {
      const result = local.parse(text, { locale: ctx.locale.tag });
      return result.ok ? { ok: true, value: result.value } : result;
    },
    format: (value, ctx) => local.format(value as never, { locale: ctx.locale.tag }),
    check: (value) => {
      const result = local.schema['~standard'].validate(value);
      return result instanceof Promise || !result.issues ? [] : result.issues.map((issue) => ({ message: issue.message }));
    },
    options,
  });
};

interface City {
  readonly name: string;
  readonly region: string;
}

const CITIES: readonly City[] = [
  { name: 'Springfield', region: 'IL' },
  { name: 'Springfield', region: 'MO' },
  { name: 'Springfield', region: 'MA' },
  { name: 'Chicago', region: 'IL' },
];
const label = (city: City): string => `${city.name}, ${city.region}`;
const cityCheck = (value: unknown) => (typeof (value as City | null)?.name === 'string' ? [] : [{ message: 'Expected { name, region }.' }]);

/** A stub service that only completes, with labels that fetch the city when chosen. */
const completeCity = async (text: string): Promise<readonly Completion<City>[]> =>
  CITIES.filter((city) => label(city).toLowerCase().startsWith(text.toLowerCase())).map((city) => ({ label: label(city), resolve: async () => city }));

/** Completes, and parses with `parseFromCompletions`: one candidate is the value, several are ambiguous. */
const city = defineExternalCodec<City>({ id: 'city', parse: parseFromCompletions(completeCity), complete: completeCity, format: label, check: cityCheck });

/** Doesn't complete; an ambiguous parse returns its candidates as alternatives (known values). */
const cityAlternatives = defineExternalCodec<City>({
  id: 'city',
  parse: async (text) => {
    const found = CITIES.filter((c) => c.name.toLowerCase() === text.toLowerCase() || label(c).toLowerCase() === text.toLowerCase());
    if (found.length === 1) return { ok: true, value: found[0]! };
    if (found.length === 0) return { ok: false, issues: [{ code: 'unparseable', message: 'No such city.' }] };
    return { ok: false, issues: [{ code: 'ambiguous', message: 'Several cities.' }], alternatives: found };
  },
  format: label,
  check: cityCheck,
});

const codecs: Record<string, ExternalCodec<unknown>> = {
  city: city as ExternalCodec<unknown>,
  optionalCity: optional(city) as ExternalCodec<unknown>,
  cityAlternatives: cityAlternatives as ExternalCodec<unknown>,
  length: externalLength(),
  optionalLength: optional(externalLength()),
  shortLength: externalLength({
    schema: { '~standard': { version: 1, vendor: 'test', validate: (v) => ((v as { value: number }).value > 100 ? { issues: [{ message: 'Too long.' }] } : { value: v as never }) } },
  }),
};

interface Step {
  readonly event?: ExternalFieldEvent<unknown>;
  /** Runs request `resolve` through the codec and dispatches its result. */
  readonly resolve?: number;
  /** Dispatches a rejection of request `reject`. */
  readonly reject?: number;
  /** Runs completion request `complete` through the codec and dispatches its answer. */
  readonly complete?: number;
  /** Dispatches a failure of completion request `failComplete`. */
  readonly failComplete?: number;
  /** Runs fetch `fetch` (a chosen completion's `resolve`) and dispatches its value. */
  readonly fetch?: number;
  /** Dispatches a failure of fetch `failFetch`. */
  readonly failFetch?: number;
  readonly raw?: string;
  /** The envelope committed by this step, with issues as codes; absent means no commit. */
  readonly commit?: { readonly raw: string; readonly value?: unknown; readonly issues?: readonly string[] };
  /** The text of the request this step started; absent means none. */
  readonly request?: string;
  /** The ids of the requests this step aborted; absent means none. */
  readonly abort?: readonly number[];
  /** The text of the completion request this step started; absent means none. */
  readonly completing?: string;
  /** The label of the completion whose fetch this step started; absent means none. */
  readonly fetching?: string;
  /** The list's entries, as labels: alternatives formatted, then completions. */
  readonly entries?: readonly string[];
  readonly open?: boolean;
  /** The highlighted entry's index, or null. */
  readonly highlighted?: number | null;
  /** A chosen completion's fetch is in flight. */
  readonly resolving?: boolean;
  /** The completion session, or null. */
  readonly session?: number | null;
  readonly issues?: readonly string[];
  readonly pending?: boolean;
  readonly failed?: boolean;
}

interface Script {
  readonly name: string;
  readonly codec: string;
  readonly display?: Display;
  readonly restoreOnEdit?: boolean;
  readonly completions?: boolean;
  readonly init?: { readonly defaultValue?: unknown; readonly defaultRaw?: string; readonly value?: QuantoValue<unknown> };
  readonly steps: readonly Step[];
}

const asCodes = (value: QuantoValue<unknown>) => ('issues' in value ? { raw: value.raw, issues: value.issues.map((i) => i.code) } : value);

for (const script of fixtures as unknown as readonly Script[]) {
  test(script.name, async () => {
    const env: ExternalFieldEnv<unknown> = {
      codec: codecs[script.codec]!,
      ctx: { locale: 'en-US' },
      display: script.display ?? 'formatted-on-blur',
      restoreOnEdit: script.restoreOnEdit,
      completions: script.completions,
    };
    let state = initialExternalState(env, script.init);
    const requests = new Map<number, string>();
    const completionRequests = new Map<number, string>();
    const fetches = new Map<number, Completion<unknown>>();
    for (const [i, step] of script.steps.entries()) {
      const where = `step ${i} (${JSON.stringify(step.event ?? step)})`;
      let event: ExternalFieldEvent<unknown>;
      if (step.resolve !== undefined) {
        const text = requests.get(step.resolve);
        if (text === undefined) throw new Error(`${where}: no request ${step.resolve}`);
        event = { type: 'resolved', id: step.resolve, result: await env.codec.parse(text, env.ctx) };
      } else if (step.reject !== undefined) {
        event = { type: 'rejected', id: step.reject, error: new Error('Service unavailable.') };
      } else if (step.complete !== undefined) {
        const text = completionRequests.get(step.complete);
        if (text === undefined) throw new Error(`${where}: no completion request ${step.complete}`);
        event = { type: 'completed', id: step.complete, completions: await env.codec.complete!(text, env.ctx) };
      } else if (step.failComplete !== undefined) {
        event = { type: 'completeFailed', id: step.failComplete };
      } else if (step.fetch !== undefined) {
        const completion = fetches.get(step.fetch);
        if (!completion || 'value' in completion) throw new Error(`${where}: no fetch ${step.fetch}`);
        event = { type: 'picked', id: step.fetch, value: await completion.resolve(env.ctx) };
      } else if (step.failFetch !== undefined) {
        event = { type: 'pickFailed', id: step.failFetch, error: new Error('Service unavailable.') };
      } else event = step.event!;
      const transition: ExternalTransition<unknown> = reduceExternal(env, state, event);
      state = transition.state;
      if (transition.request) requests.set(transition.request.id, transition.request.text);
      if (transition.complete) completionRequests.set(transition.complete.id, transition.complete.text);
      if (transition.resolve) fetches.set(transition.resolve.id, transition.resolve.completion);
      expect(transition.commit && asCodes(transition.commit.value), `${where}: commit`).toEqual(step.commit);
      expect(transition.request?.text, `${where}: request`).toBe(step.request);
      expect(transition.abort, `${where}: abort`).toEqual(step.abort);
      expect(transition.complete?.text, `${where}: completing`).toBe(step.completing);
      expect(transition.resolve?.completion.label, `${where}: fetching`).toBe(step.fetching);
      if (step.entries !== undefined) {
        const labels = entries(state).map((entry) => (entry.kind === 'alternative' ? env.codec.format(entry.value, env.ctx) : entry.completion.label));
        expect(labels, `${where}: entries`).toEqual(step.entries);
      }
      if (step.open !== undefined) expect(isOpen(env, state), `${where}: open`).toBe(step.open);
      if (step.highlighted !== undefined) expect(state.highlighted ?? null, `${where}: highlighted`).toBe(step.highlighted);
      if (step.resolving !== undefined) expect(state.resolving !== undefined, `${where}: resolving`).toBe(step.resolving);
      if (step.session !== undefined) expect(state.session ?? null, `${where}: session`).toBe(step.session);
      if (step.raw !== undefined) expect(state.raw, `${where}: raw`).toBe(step.raw);
      if (step.pending !== undefined) expect(state.pending !== undefined, `${where}: pending`).toBe(step.pending);
      if (step.failed !== undefined) expect(state.failed !== undefined, `${where}: failed`).toBe(step.failed);
      if (step.issues !== undefined) {
        const shown = state.showIssues && state.committed && 'issues' in state.committed ? state.committed.issues.map((x) => x.code) : [];
        expect(shown, `${where}: issues`).toEqual(step.issues);
      }
    }
  });
}
