// Runs the field's scripted fixtures: events in, the text, commits, issues and echo out.
import { expect, test } from 'vitest';
import { merge, optional, type Codec, type QuantoValue } from 'quanto';
import { duration, length } from 'quanto/codecs';
import { feetInches } from 'quanto/formats';
import fixtures from './fixtures.json';
import { echo, initialState, reduce, type Display, type FieldEnv, type FieldEvent } from './index';

const shortLength = length({
  schema: { '~standard': { version: 1, vendor: 'test', validate: (v) => ((v as { value: number }).value > 100 ? { issues: [{ message: 'Too long.' }] } : { value: v as never }) } },
});

const roundedLength = length({
  schema: { '~standard': { version: 1, vendor: 'test', validate: (v) => ({ value: { ...(v as { value: number }), value: Math.round((v as { value: number }).value) } as never }) } },
});

const codecs: Record<string, Codec<unknown>> = {
  height: length({ defaultUnit: 'in', format: feetInches }) as Codec<unknown>,
  length: length() as Codec<unknown>,
  optionalLength: optional(length()) as Codec<unknown>,
  shortLength: shortLength as Codec<unknown>,
  roundedLength: roundedLength as Codec<unknown>,
  lengthOrDuration: merge([length(), duration()]) as Codec<unknown>,
};

interface Step {
  readonly event: FieldEvent<unknown>;
  readonly raw?: string;
  /** The envelope committed by this event, with issues as codes; absent means no commit. */
  readonly commit?: { readonly raw: string; readonly value?: unknown; readonly issues?: readonly string[] };
  readonly issues?: readonly string[];
  readonly echo?: string | null;
  readonly alternatives?: readonly unknown[];
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
  test(script.name, () => {
    const env: FieldEnv<unknown> = { codec: codecs[script.codec]!, ctx: { locale: 'en-US' }, display: script.display ?? 'formatted-on-blur', restoreOnEdit: script.restoreOnEdit };
    let state = initialState(env, script.init);
    script.steps.forEach((step, i) => {
      const where = `step ${i} (${JSON.stringify(step.event)})`;
      const transition = reduce(env, state, step.event);
      state = transition.state;
      expect(transition.commit && asCodes(transition.commit.value), `${where}: commit`).toEqual(step.commit);
      if (step.raw !== undefined) expect(state.raw, `${where}: raw`).toBe(step.raw);
      if (step.issues !== undefined) {
        const shown = state.showIssues && state.committed && 'issues' in state.committed ? state.committed.issues.map((x) => x.code) : [];
        expect(shown, `${where}: issues`).toEqual(step.issues);
      }
      if (step.echo !== undefined) expect(echo(env, state)?.text ?? null, `${where}: echo`).toBe(step.echo);
      if (step.alternatives !== undefined) expect(echo(env, state)?.alternatives, `${where}: alternatives`).toEqual(step.alternatives);
    });
  });
}
