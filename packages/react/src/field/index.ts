// The input field's state machine, with no React in it, so a React Native adapter can share it.
// See DESIGN.md, "The input component".

import { isInvalidValueError, type Codec, type Ctx, type Issue, type ParseContext, type QuantoValue } from 'quanto';

/** What the input shows after a commit: what was typed, or the formatted value. */
export type Display = 'raw' | 'formatted-on-blur' | 'formatted';

export interface FieldState<T> {
  /** The text in the input. */
  readonly raw: string;
  /** The last committed envelope, or undefined before the first commit or default. */
  readonly committed: QuantoValue<T> | undefined;
  /** Alternatives from the last successful commit. Transient UI hints; never part of the envelope. */
  readonly alternatives: readonly T[];
  /** Whether the committed issues are showing. They show after a failed commit and clear once the text parses. */
  readonly showIssues: boolean;
  readonly focused: boolean;
  /** An IME composition is in progress, so the text is half a character and isn't parsed. */
  readonly composing: boolean;
  /** The text changed since the last commit, default or external value. Unedited text never re-commits. */
  readonly edited: boolean;
}

export type FieldEvent<T> =
  | { readonly type: 'input'; readonly raw: string }
  | { readonly type: 'compositionStart' }
  | { readonly type: 'compositionEnd'; readonly raw: string }
  | { readonly type: 'focus' }
  | { readonly type: 'blur' }
  | { readonly type: 'enter' }
  /** An accessory (a picker) chose a value. */
  | { readonly type: 'pick'; readonly value: T }
  /** A controlled `value` prop changed. `null` or `undefined` clears the field. */
  | { readonly type: 'external'; readonly value: QuantoValue<T> | null | undefined };

export interface FieldEnv<T> {
  readonly codec: Codec<T>;
  readonly ctx?: Ctx | undefined;
  readonly display: Display;
  /**
   * With a formatted display: focusing puts back the text that was typed, and leaving it unedited shows
   * the formatted value again without committing.
   */
  readonly restoreOnEdit?: boolean | undefined;
}

/** What a commit emits: the envelope, and the parse context when it parsed. */
export interface Commit<T> {
  readonly value: QuantoValue<T>;
  readonly context?: ParseContext | undefined;
}

export interface Transition<T> {
  readonly state: FieldState<T>;
  /** Set when the event committed: call the app's `onChange` with it. */
  readonly commit?: Commit<T> | undefined;
}

/**
 * `format`, or undefined when the value is malformed (a stale unit, say), so the field keeps its text.
 * Any other error is a bug in the formatter and propagates.
 */
function tryFormat<T>(env: FieldEnv<T>, value: T): string | undefined {
  try {
    return env.codec.format(value, env.ctx);
  } catch (error) {
    if (isInvalidValueError(error)) return undefined;
    throw error;
  }
}

/** The text for the committed envelope while it isn't being edited: the formatted value in formatted modes, else its raw. */
function settled<T>(env: FieldEnv<T>, committed: QuantoValue<T>): string {
  return (env.display !== 'raw' && 'value' in committed ? tryFormat(env, committed.value) : undefined) ?? committed.raw;
}

/** The starting state: empty, or a default value, shown as `defaultRaw` if given or else formatted. */
export function initialState<T>(env: FieldEnv<T>, init?: { readonly defaultValue?: T | undefined; readonly defaultRaw?: string | undefined; readonly value?: QuantoValue<T> | undefined }): FieldState<T> {
  const base: FieldState<T> = { raw: '', committed: undefined, alternatives: [], showIssues: false, focused: false, composing: false, edited: false };
  if (init?.value !== undefined) return fromEnvelope(env, base, init.value);
  if (init?.defaultValue === undefined) return base;
  const raw = init.defaultRaw ?? tryFormat(env, init.defaultValue) ?? '';
  return { ...base, raw, committed: { raw, value: init.defaultValue } };
}

/** Shows an envelope set from outside: its raw text, or in formatted modes the formatted value. */
function fromEnvelope<T>(env: FieldEnv<T>, state: FieldState<T>, value: QuantoValue<T>): FieldState<T> {
  return { ...state, raw: settled(env, value), committed: value, alternatives: [], showIssues: 'issues' in value, edited: false };
}

/** Whether two envelopes are the same, so echoing a committed value back as a controlled prop is a no-op. */
function sameEnvelope<T>(a: QuantoValue<T> | undefined, b: QuantoValue<T> | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.raw !== b.raw) return false;
  return JSON.stringify('value' in a ? a.value : a.issues) === JSON.stringify('value' in b ? b.value : b.issues);
}

function commit<T>(env: FieldEnv<T>, state: FieldState<T>, trigger: 'blur' | 'enter'): Transition<T> {
  if (!state.edited) {
    // Leaving restored text untouched puts the formatted value back. Nothing changed, so nothing commits.
    if (env.restoreOnEdit && trigger === 'blur' && state.committed) return { state: { ...state, raw: settled(env, state.committed) } };
    return { state };
  }
  const result = env.codec.parse(state.raw, env.ctx);
  if (!result.ok) {
    return { state: { ...state, committed: { raw: state.raw, issues: result.issues }, alternatives: [], showIssues: true, edited: false }, commit: { value: { raw: state.raw, issues: result.issues } } };
  }
  const reformat = env.display === 'formatted' || (env.display === 'formatted-on-blur' && trigger === 'blur');
  const shown = (reformat ? tryFormat(env, result.value) : undefined) ?? state.raw;
  const value: QuantoValue<T> = { raw: state.raw, value: result.value };
  return { state: { ...state, raw: shown, committed: value, alternatives: result.alternatives ?? [], showIssues: false, edited: false }, commit: { value, context: result.context } };
}

/** Runs the codec's schema: its output, which may be transformed, or its issues as `invalid` issues. */
function validate<T>(codec: Codec<T>, value: T): { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly Issue[] } {
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

/** The pure transition function. Never throws on user input. */
export function reduce<T>(env: FieldEnv<T>, state: FieldState<T>, event: FieldEvent<T>): Transition<T> {
  switch (event.type) {
    case 'input': {
      const next = { ...state, raw: event.raw, alternatives: [], edited: true };
      // Issues clear as soon as the text parses again, rather than waiting for the next commit.
      if (state.showIssues && !state.composing && env.codec.parse(event.raw, env.ctx).ok) return { state: { ...next, showIssues: false } };
      return { state: next };
    }
    case 'compositionStart':
      return { state: { ...state, composing: true } };
    case 'compositionEnd':
      return reduce(env, { ...state, composing: false }, { type: 'input', raw: event.raw });
    case 'focus':
      // The committed raw is what was typed. It stays unedited, so it's never re-parsed and can't re-commit.
      if (env.restoreOnEdit && !state.edited && state.committed) return { state: { ...state, raw: state.committed.raw, focused: true } };
      return { state: { ...state, focused: true } };
    case 'blur':
      return commit(env, { ...state, focused: false, composing: false }, 'blur');
    case 'enter':
      return state.composing ? { state } : commit(env, state, 'enter');
    case 'pick': {
      // The schema's output is what's stored and shown, so a transforming schema is respected.
      const validated = validate(env.codec, event.value);
      const raw = tryFormat(env, validated.ok ? validated.value : event.value);
      if (raw === undefined) return { state };
      const value: QuantoValue<T> = validated.ok ? { raw, value: validated.value } : { raw, issues: validated.issues };
      return { state: { ...state, raw, committed: value, alternatives: [], showIssues: !validated.ok, edited: false }, commit: { value } };
    }
    case 'external': {
      const value = event.value ?? undefined;
      if (sameEnvelope(value, state.committed)) return { state };
      // Local edits win: a value that arrives mid-edit is dropped, not queued, and the commit on blur settles it.
      if (state.focused && state.edited) return { state };
      if (value === undefined) return { state: { ...state, raw: '', committed: undefined, alternatives: [], showIssues: false, edited: false } };
      return { state: fromEnvelope(env, state, value) };
    }
  }
}

/** The live interpretation of the text, for display while typing. Never emitted or stored. */
export interface Echo<T> {
  readonly value: T;
  /** The value formatted, e.g. `5 ft 11 in` for `5'11`. */
  readonly text: string;
  /** From `merge()`: other readings of the same text. */
  readonly alternatives: readonly T[];
}

/**
 * The echo for the current text. Unedited text shows the committed value rather than a re-parse, since
 * re-parsing restored text (`tomorrow`) can give a different value from the one stored. Undefined when
 * the text is empty or doesn't parse.
 */
export function echo<T>(env: FieldEnv<T>, state: FieldState<T>): Echo<T> | undefined {
  if (state.composing || state.raw.trim() === '') return undefined;
  if (!state.edited) {
    if (!state.committed || !('value' in state.committed)) return undefined;
    const text = tryFormat(env, state.committed.value);
    return text === undefined ? undefined : { value: state.committed.value, text, alternatives: state.alternatives };
  }
  const result = env.codec.parse(state.raw, env.ctx);
  if (!result.ok) return undefined;
  const text = tryFormat(env, result.value);
  return text === undefined ? undefined : { value: result.value, text, alternatives: result.alternatives ?? [] };
}
