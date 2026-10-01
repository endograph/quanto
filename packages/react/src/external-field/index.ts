// The external field's state machine: the field for an external codec, which parses on commit only.
// No React in it, so a React Native adapter can share it. See DESIGN.md, "External codecs".
//
// It stays pure by returning effects: a commit returns a `request` for the adapter to run through the
// codec, and the outcome comes back as a `resolved` or `rejected` event. A result for any request but
// the current one is ignored, and a request that's superseded comes back as `abort`.

import { isInvalidValueError, type Ctx, type ExternalCodec, type Issue, type ParseContext, type ParseResult, type QuantoValue } from 'quanto';
import type { Commit, Display } from '../field';

export interface ExternalFieldState<T> {
  /** The text in the input. */
  readonly raw: string;
  /** The last committed envelope, or undefined before the first commit or default. */
  readonly committed: QuantoValue<T> | undefined;
  /** Whether the committed issues are showing. They show after a failed commit, until the next commit. */
  readonly showIssues: boolean;
  readonly focused: boolean;
  /** An IME composition is in progress, so the text is half a character and isn't committed. */
  readonly composing: boolean;
  /** The text changed since the last commit, default or external value. Unedited text never re-commits. */
  readonly edited: boolean;
  /** The parse in flight: its request id and what started it. */
  readonly pending: { readonly id: number; readonly trigger: 'blur' | 'enter' } | undefined;
  /** What the last parse rejected with, when the service couldn't answer. Cleared by the next commit or edit. */
  readonly failed: { readonly error: unknown } | undefined;
  /** The id the next request gets. */
  readonly nextId: number;
}

export type ExternalFieldEvent<T> =
  | { readonly type: 'input'; readonly raw: string }
  | { readonly type: 'compositionStart' }
  | { readonly type: 'compositionEnd'; readonly raw: string }
  | { readonly type: 'focus' }
  | { readonly type: 'blur' }
  | { readonly type: 'enter' }
  /** Commits the current text again after a failure, as a blur would when unfocused and Enter when focused. */
  | { readonly type: 'retry' }
  /** An accessory (a picker) chose a value. */
  | { readonly type: 'pick'; readonly value: T }
  /** A controlled `value` prop changed. `null` or `undefined` clears the field. */
  | { readonly type: 'external'; readonly value: QuantoValue<T> | null | undefined }
  /** The codec resolved request `id`. */
  | { readonly type: 'resolved'; readonly id: number; readonly result: ParseResult<T> }
  /** The codec rejected request `id`: the service couldn't answer. */
  | { readonly type: 'rejected'; readonly id: number; readonly error: unknown };

export interface ExternalFieldEnv<T> {
  readonly codec: ExternalCodec<T>;
  readonly ctx?: Ctx | undefined;
  readonly display: Display;
  /**
   * With a formatted display: focusing puts back the text that was typed, and leaving it unedited shows
   * the formatted value again without committing.
   */
  readonly restoreOnEdit?: boolean | undefined;
}

export interface ExternalTransition<T> {
  readonly state: ExternalFieldState<T>;
  /** Set when the event committed: call the app's `onChange` with it. */
  readonly commit?: Commit<T> | undefined;
  /** A parse to start: run `text` through the codec and dispatch the outcome with this `id`. */
  readonly request?: { readonly id: number; readonly text: string } | undefined;
  /** A request that's no longer wanted: abort it. Its outcome would be ignored anyway. */
  readonly abort?: number | undefined;
}

/**
 * `format`, or undefined when the value is malformed (a stale unit, say), so the field keeps its text.
 * Any other error is a bug in the formatter and propagates.
 */
function tryFormat<T>(env: ExternalFieldEnv<T>, value: T): string | undefined {
  try {
    return env.codec.format(value, env.ctx);
  } catch (error) {
    if (isInvalidValueError(error)) return undefined;
    throw error;
  }
}

/** The text for the committed envelope while it isn't being edited: the formatted value in formatted modes, else its raw. */
function settled<T>(env: ExternalFieldEnv<T>, committed: QuantoValue<T>): string {
  return (env.display !== 'raw' && 'value' in committed ? tryFormat(env, committed.value) : undefined) ?? committed.raw;
}

/** The starting state: empty, or a default value, shown as `defaultRaw` if given or else formatted. */
export function initialExternalState<T>(
  env: ExternalFieldEnv<T>,
  init?: { readonly defaultValue?: T | undefined; readonly defaultRaw?: string | undefined; readonly value?: QuantoValue<T> | undefined },
): ExternalFieldState<T> {
  const base: ExternalFieldState<T> = { raw: '', committed: undefined, showIssues: false, focused: false, composing: false, edited: false, pending: undefined, failed: undefined, nextId: 1 };
  if (init?.value !== undefined) return fromEnvelope(env, base, init.value);
  if (init?.defaultValue === undefined) return base;
  const raw = init.defaultRaw ?? tryFormat(env, init.defaultValue) ?? '';
  return { ...base, raw, committed: { raw, value: init.defaultValue } };
}

/** Shows an envelope set from outside: its raw text, or in formatted modes the formatted value. */
function fromEnvelope<T>(env: ExternalFieldEnv<T>, state: ExternalFieldState<T>, value: QuantoValue<T>): ExternalFieldState<T> {
  return { ...state, raw: settled(env, value), committed: value, showIssues: 'issues' in value, edited: false, failed: undefined };
}

/** Whether two envelopes are the same, so echoing a committed value back as a controlled prop is a no-op. */
function sameEnvelope<T>(a: QuantoValue<T> | undefined, b: QuantoValue<T> | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.raw !== b.raw) return false;
  return JSON.stringify('value' in a ? a.value : a.issues) === JSON.stringify('value' in b ? b.value : b.issues);
}

/** Drops the parse in flight, if any, and says to abort it. */
function cancel<T>(transition: ExternalTransition<T>, previous: ExternalFieldState<T>): ExternalTransition<T> {
  if (!previous.pending) return transition;
  return { ...transition, state: { ...transition.state, pending: undefined }, abort: previous.pending.id };
}

/** Starts a parse of the text, unless it's unedited or one is already in flight. */
function commit<T>(env: ExternalFieldEnv<T>, state: ExternalFieldState<T>, trigger: 'blur' | 'enter'): ExternalTransition<T> {
  if (!state.edited) {
    // Leaving restored text untouched puts the formatted value back. Nothing changed, so nothing commits.
    if (env.restoreOnEdit && trigger === 'blur' && state.committed) return { state: { ...state, raw: settled(env, state.committed) } };
    return { state };
  }
  // The text can't have changed since that parse started, since editing cancels it: let it finish.
  if (state.pending) return { state };
  const id = state.nextId;
  return { state: { ...state, pending: { id, trigger }, failed: undefined, nextId: id + 1 }, request: { id, text: state.raw } };
}

/** Applies the parse that was in flight, as the sync field applies a parse on commit. */
function resolve<T>(env: ExternalFieldEnv<T>, state: ExternalFieldState<T>, trigger: 'blur' | 'enter', result: ParseResult<T>): ExternalTransition<T> {
  const done = { ...state, pending: undefined, failed: undefined, edited: false };
  if (!result.ok) {
    const value: QuantoValue<T> = { raw: state.raw, issues: result.issues };
    return { state: { ...done, committed: value, showIssues: true }, commit: { value } };
  }
  const reformat = env.display === 'formatted' || (env.display === 'formatted-on-blur' && trigger === 'blur');
  const shown = (reformat ? tryFormat(env, result.value) : undefined) ?? state.raw;
  const value: QuantoValue<T> = { raw: state.raw, value: result.value };
  const context: ParseContext = result.context;
  return { state: { ...done, raw: shown, committed: value, showIssues: false }, commit: { value, context } };
}

/** Runs the codec's schema: its output, which may be transformed, or its issues as `invalid` issues. */
function validate<T>(codec: ExternalCodec<T>, value: T): { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly Issue[] } {
  const result = codec.schema['~standard'].validate(value);
  if (result instanceof Promise) throw new Error(`quanto: the schema of codec "${codec.id}" is async. quanto supports only synchronous schemas.`);
  if (!result.issues) return { ok: true, value: result.value };
  return {
    ok: false,
    issues: result.issues.map((issue): Issue => {
      const path = issue.path?.map((segment) => (typeof segment === 'object' ? segment.key : segment));
      return path?.length ? { code: 'invalid', message: issue.message, path } : { code: 'invalid', message: issue.message };
    }),
  };
}

/** The pure transition function. Never throws on user input or a failed service. */
export function reduceExternal<T>(env: ExternalFieldEnv<T>, state: ExternalFieldState<T>, event: ExternalFieldEvent<T>): ExternalTransition<T> {
  switch (event.type) {
    case 'input':
      // Editing makes the parse in flight stale. Issues stay until the next commit settles.
      return cancel({ state: { ...state, raw: event.raw, edited: true, failed: undefined } }, state);
    case 'compositionStart':
      return { state: { ...state, composing: true } };
    case 'compositionEnd':
      return reduceExternal(env, { ...state, composing: false }, { type: 'input', raw: event.raw });
    case 'focus':
      // The committed raw is what was typed. It stays unedited, so it's never re-parsed and can't re-commit.
      if (env.restoreOnEdit && !state.edited && state.committed) return { state: { ...state, raw: state.committed.raw, focused: true } };
      return { state: { ...state, focused: true } };
    case 'blur':
      return commit(env, { ...state, focused: false, composing: false }, 'blur');
    case 'enter':
      return state.composing ? { state } : commit(env, state, 'enter');
    case 'retry':
      return state.failed ? commit(env, state, state.focused ? 'enter' : 'blur') : { state };
    case 'resolved':
      if (state.pending?.id !== event.id) return { state };
      return resolve(env, state, state.pending.trigger, event.result);
    case 'rejected':
      // Nothing commits: the text stays edited, so the next blur or Enter (or a retry) parses it again.
      if (state.pending?.id !== event.id) return { state };
      return { state: { ...state, pending: undefined, failed: { error: event.error } } };
    case 'pick': {
      // The schema's output is what's stored and shown, so a transforming schema is respected.
      const validated = validate(env.codec, event.value);
      const raw = tryFormat(env, validated.ok ? validated.value : event.value);
      if (raw === undefined) return { state };
      const value: QuantoValue<T> = validated.ok ? { raw, value: validated.value } : { raw, issues: validated.issues };
      const next = { ...state, raw, committed: value, showIssues: !validated.ok, edited: false, failed: undefined };
      return cancel({ state: next, commit: { value } }, state);
    }
    case 'external': {
      const value = event.value ?? undefined;
      if (sameEnvelope(value, state.committed)) return { state };
      // Local edits win, including one whose parse is still in flight after a blur: a value that arrives
      // then is dropped, not queued, and the edit's commit settles it.
      if (state.edited && (state.focused || state.pending)) return { state };
      if (value === undefined) return { state: { ...state, raw: '', committed: undefined, showIssues: false, edited: false, failed: undefined } };
      return { state: fromEnvelope(env, state, value) };
    }
  }
}
