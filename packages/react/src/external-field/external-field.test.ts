// Runs the external field's scripted fixtures: events in; the text, requests, aborts, commits, issues,
// pending and failed out. `resolve` runs a request's text through the codec; `reject` fails it.
import { expect, test } from 'vitest';
import { defineExternalCodec, optional, type CodecOptions, type ExternalCodec, type QuantoValue } from 'quanto';
import { length } from 'quanto/codecs';
import fixtures from './fixtures.json';
import { initialExternalState, reduceExternal, type ExternalFieldEnv, type ExternalFieldEvent, type ExternalTransition } from './index';
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

const codecs: Record<string, ExternalCodec<unknown>> = {
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
  readonly raw?: string;
  /** The envelope committed by this step, with issues as codes; absent means no commit. */
  readonly commit?: { readonly raw: string; readonly value?: unknown; readonly issues?: readonly string[] };
  /** The text of the request this step started; absent means none. */
  readonly request?: string;
  /** The id of the request this step aborted; absent means none. */
  readonly abort?: number;
  readonly issues?: readonly string[];
  readonly pending?: boolean;
  readonly failed?: boolean;
}

interface Script {
  readonly name: string;
  readonly codec: string;
  readonly display?: Display;
  readonly restoreOnEdit?: boolean;
  readonly init?: { readonly defaultValue?: unknown; readonly defaultRaw?: string; readonly value?: QuantoValue<unknown> };
  readonly steps: readonly Step[];
}

const asCodes = (value: QuantoValue<unknown>) => ('issues' in value ? { raw: value.raw, issues: value.issues.map((i) => i.code) } : value);

for (const script of fixtures as unknown as readonly Script[]) {
  test(script.name, async () => {
    const env: ExternalFieldEnv<unknown> = { codec: codecs[script.codec]!, ctx: { locale: 'en-US' }, display: script.display ?? 'formatted-on-blur', restoreOnEdit: script.restoreOnEdit };
    let state = initialExternalState(env, script.init);
    const requests = new Map<number, string>();
    for (const [i, step] of script.steps.entries()) {
      const where = `step ${i} (${JSON.stringify(step.event ?? step)})`;
      let event: ExternalFieldEvent<unknown>;
      if (step.resolve !== undefined) {
        const text = requests.get(step.resolve);
        if (text === undefined) throw new Error(`${where}: no request ${step.resolve}`);
        event = { type: 'resolved', id: step.resolve, result: await env.codec.parse(text, env.ctx) };
      } else if (step.reject !== undefined) {
        event = { type: 'rejected', id: step.reject, error: new Error('Service unavailable.') };
      } else event = step.event!;
      const transition: ExternalTransition<unknown> = reduceExternal(env, state, event);
      state = transition.state;
      if (transition.request) requests.set(transition.request.id, transition.request.text);
      expect(transition.commit && asCodes(transition.commit.value), `${where}: commit`).toEqual(step.commit);
      expect(transition.request?.text, `${where}: request`).toBe(step.request);
      expect(transition.abort, `${where}: abort`).toBe(step.abort);
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
