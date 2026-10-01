// The external field's state machine: the field for an external codec, which parses on commit only.
// No React in it, so a React Native adapter can share it. See DESIGN.md, "External codecs".
//
// It stays pure by returning effects: a commit returns a `request` for the adapter to run through the
// codec, and the outcome comes back as a `resolved` or `rejected` event. Completions work the same way,
// with `complete` and `resolve` effects. A result for any request but the current one is ignored, and
// requests that are superseded come back in `abort`.

import { isInvalidValueError, type Completion, type Ctx, type ExternalCodec, type ExternalParseResult, type Issue, type ParseContext, type QuantoValue } from 'quanto';
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
  /**
   * What the last parse, or the fetch of a chosen completion, rejected with, when the service couldn't
   * answer. Cleared by the next commit or edit. `completion` is set when it was a fetch, for `retry`.
   */
  readonly failed: { readonly error: unknown; readonly completion?: Completion<T> | undefined } | undefined;
  /** The id the next request gets. */
  readonly nextId: number;
  /** Other readings of the committed text, from the last commit. Transient; never part of the envelope. */
  readonly alternatives: readonly T[];
  /** Completions for the text: from `complete` while typing, or the last commit's. Transient. */
  readonly completions: readonly Completion<T>[];
  /** The `complete` call in flight. */
  readonly completing: number | undefined;
  /** The chosen completion whose value is being fetched. */
  readonly resolving: { readonly id: number; readonly completion: Completion<T> } | undefined;
  /** The highlighted entry, an index into `entries(state)`. */
  readonly highlighted: number | undefined;
  /** Escape closed the list; the next edit or arrow key opens it again. */
  readonly dismissed: boolean;
  /** The completion session: started by the first edit, ended by a committed value. */
  readonly session: number | undefined;
  /** The number the next session gets. */
  readonly nextSession: number;
}

export type ExternalFieldEvent<T> =
  | { readonly type: 'input'; readonly raw: string }
  | { readonly type: 'compositionStart' }
  | { readonly type: 'compositionEnd'; readonly raw: string }
  | { readonly type: 'focus' }
  | { readonly type: 'blur' }
  /** Enter: picks the highlighted entry if the list is open, else commits the text. */
  | { readonly type: 'enter' }
  /** Commits the text now, as Enter would with nothing highlighted, keeping focus. */
  | { readonly type: 'commit' }
  /** Starts again whatever failed: the parse, or the fetch of a chosen completion. */
  | { readonly type: 'retry' }
  /** An accessory (a picker) chose a value. */
  | { readonly type: 'pick'; readonly value: T }
  /** An alternative was chosen: it becomes the value, and the committed text stays. */
  | { readonly type: 'choose'; readonly value: T }
  /** An entry of the list was chosen. */
  | { readonly type: 'select'; readonly index: number }
  /** The arrow keys: move the highlight, opening the list if Escape closed it. */
  | { readonly type: 'move'; readonly by: 1 | -1 }
  /** The pointer is over an entry, or none. */
  | { readonly type: 'highlight'; readonly index: number | undefined }
  /** Escape: closes the list until the next edit or arrow key. */
  | { readonly type: 'dismiss' }
  /** A controlled `value` prop changed. `null` or `undefined` clears the field. */
  | { readonly type: 'external'; readonly value: QuantoValue<T> | null | undefined }
  /** The codec resolved request `id`. */
  | { readonly type: 'resolved'; readonly id: number; readonly result: ExternalParseResult<T> }
  /** The codec rejected request `id`: the service couldn't answer. */
  | { readonly type: 'rejected'; readonly id: number; readonly error: unknown }
  /** `complete` request `id` answered. */
  | { readonly type: 'completed'; readonly id: number; readonly completions: readonly Completion<T>[] }
  /** `complete` request `id` failed. Completions are help, so the field just goes without. */
  | { readonly type: 'completeFailed'; readonly id: number }
  /** The chosen completion's fetch, request `id`, gave its value. */
  | { readonly type: 'picked'; readonly id: number; readonly value: T }
  /** The chosen completion's fetch, request `id`, failed: the service couldn't answer. */
  | { readonly type: 'pickFailed'; readonly id: number; readonly error: unknown };

export interface ExternalFieldEnv<T> {
  readonly codec: ExternalCodec<T>;
  readonly ctx?: Ctx | undefined;
  readonly display: Display;
  /**
   * With a formatted display: focusing puts back the text that was typed, and leaving it unedited shows
   * the formatted value again without committing.
   */
  readonly restoreOnEdit?: boolean | undefined;
  /** The app renders the list: ask the codec for completions while typing, and keep the list's state. */
  readonly completions?: boolean | undefined;
}

export interface ExternalTransition<T> {
  readonly state: ExternalFieldState<T>;
  /** Set when the event committed: call the app's `onChange` with it. */
  readonly commit?: Commit<T> | undefined;
  /** A parse to start: run `text` through the codec and dispatch the outcome with this `id`. */
  readonly request?: { readonly id: number; readonly text: string; readonly session?: number | undefined } | undefined;
  /** Completions to ask for: run `text` through `codec.complete` (debounced) and dispatch the outcome. */
  readonly complete?: { readonly id: number; readonly text: string; readonly session?: number | undefined } | undefined;
  /** A chosen completion's value to fetch: call its `resolve` and dispatch the outcome. */
  readonly resolve?: { readonly id: number; readonly completion: Completion<T>; readonly session?: number | undefined } | undefined;
  /** Requests that are no longer wanted: abort them. Their outcomes would be ignored anyway. */
  readonly abort?: readonly number[] | undefined;
}

/** An entry in the list: an alternative (a reading of the committed text) or a completion. */
export type Entry<T> = { readonly kind: 'alternative'; readonly value: T } | { readonly kind: 'completion'; readonly completion: Completion<T> };

/** The list's entries: the last commit's alternatives, then the completions. */
export function entries<T>(state: ExternalFieldState<T>): readonly Entry<T>[] {
  return [...state.alternatives.map((value) => ({ kind: 'alternative' as const, value })), ...state.completions.map((completion) => ({ kind: 'completion' as const, completion }))];
}

/** Whether the list shows: completions are on, the field is focused, and there's something to show. */
export function isOpen<T>(env: ExternalFieldEnv<T>, state: ExternalFieldState<T>): boolean {
  return env.completions === true && state.focused && !state.composing && !state.dismissed && state.resolving === undefined && entries(state).length > 0;
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
  const base: ExternalFieldState<T> = {
    raw: '',
    committed: undefined,
    showIssues: false,
    focused: false,
    composing: false,
    edited: false,
    pending: undefined,
    failed: undefined,
    nextId: 1,
    alternatives: [],
    completions: [],
    completing: undefined,
    resolving: undefined,
    highlighted: undefined,
    dismissed: false,
    session: undefined,
    nextSession: 1,
  };
  if (init?.value !== undefined) return fromEnvelope(env, base, init.value);
  if (init?.defaultValue === undefined) return base;
  const raw = init.defaultRaw ?? tryFormat(env, init.defaultValue) ?? '';
  return { ...base, raw, committed: { raw, value: init.defaultValue } };
}

/** The list's state, emptied: for a new value from outside, or a pick. */
const NO_LIST = { alternatives: [], completions: [], highlighted: undefined, dismissed: false } as const;

/** Shows an envelope set from outside: its raw text, or in formatted modes the formatted value. */
function fromEnvelope<T>(env: ExternalFieldEnv<T>, state: ExternalFieldState<T>, value: QuantoValue<T>): ExternalFieldState<T> {
  return { ...state, ...NO_LIST, raw: settled(env, value), committed: value, showIssues: 'issues' in value, edited: false, failed: undefined, session: undefined };
}

/** Whether two envelopes are the same, so echoing a committed value back as a controlled prop is a no-op. */
function sameEnvelope<T>(a: QuantoValue<T> | undefined, b: QuantoValue<T> | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.raw !== b.raw) return false;
  return JSON.stringify('value' in a ? a.value : a.issues) === JSON.stringify('value' in b ? b.value : b.issues);
}

/** Drops the requests in flight (all of them, or those named), and says to abort them. */
function cancel<T>(transition: ExternalTransition<T>, previous: ExternalFieldState<T>, which: ReadonlyArray<'pending' | 'completing' | 'resolving'> = ['pending', 'completing', 'resolving']): ExternalTransition<T> {
  const ids = [
    which.includes('pending') ? previous.pending?.id : undefined,
    which.includes('completing') ? previous.completing : undefined,
    which.includes('resolving') ? previous.resolving?.id : undefined,
  ].filter((id): id is number => id !== undefined);
  if (ids.length === 0) return transition;
  const state = {
    ...transition.state,
    ...(which.includes('pending') ? { pending: undefined } : {}),
    ...(which.includes('completing') ? { completing: undefined } : {}),
    ...(which.includes('resolving') ? { resolving: undefined } : {}),
  };
  return { ...transition, state, abort: [...(transition.abort ?? []), ...ids] };
}

/** Starts a parse of the text, unless it's unedited, one is already in flight, or a chosen completion is being fetched. */
function commit<T>(env: ExternalFieldEnv<T>, state: ExternalFieldState<T>, trigger: 'blur' | 'enter'): ExternalTransition<T> {
  // The chosen completion will commit; the text it replaces shouldn't.
  if (state.resolving) return { state };
  if (!state.edited) {
    // Leaving restored text untouched puts the formatted value back. Nothing changed, so nothing commits.
    if (env.restoreOnEdit && trigger === 'blur' && state.committed) return { state: { ...state, raw: settled(env, state.committed) } };
    return { state };
  }
  // The text can't have changed since that parse started, since editing cancels it: let it finish.
  if (state.pending) return { state };
  const id = state.nextId;
  // Completions for this text are superseded by what the parse says.
  return cancel(
    { state: { ...state, pending: { id, trigger }, failed: undefined, highlighted: undefined, nextId: id + 1 }, request: { id, text: state.raw, session: state.session } },
    state,
    ['completing'],
  );
}

/** Applies the parse that was in flight, as the sync field applies a parse on commit. */
function resolve<T>(env: ExternalFieldEnv<T>, state: ExternalFieldState<T>, trigger: 'blur' | 'enter', result: ExternalParseResult<T>): ExternalTransition<T> {
  const list = { alternatives: result.alternatives ?? [], completions: result.completions ?? [], highlighted: undefined, dismissed: false };
  const done = { ...state, ...list, pending: undefined, failed: undefined, edited: false };
  if (!result.ok) {
    const value: QuantoValue<T> = { raw: state.raw, issues: result.issues };
    return { state: { ...done, committed: value, showIssues: true }, commit: { value } };
  }
  const reformat = env.display === 'formatted' || (env.display === 'formatted-on-blur' && trigger === 'blur');
  const shown = (reformat ? tryFormat(env, result.value) : undefined) ?? state.raw;
  const value: QuantoValue<T> = { raw: state.raw, value: result.value };
  const context: ParseContext = result.context;
  // A committed value ends the completion session.
  return { state: { ...done, raw: shown, committed: value, showIssues: false, session: undefined }, commit: { value, context } };
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

/** Commits a picked value (an accessory's, or a chosen completion's): the text becomes `format(value)`. */
function pick<T>(env: ExternalFieldEnv<T>, state: ExternalFieldState<T>, picked: T): ExternalTransition<T> {
  // The schema's output is what's stored and shown, so a transforming schema is respected.
  const validated = validate(env.codec, picked);
  const raw = tryFormat(env, validated.ok ? validated.value : picked);
  if (raw === undefined) return { state };
  const value: QuantoValue<T> = validated.ok ? { raw, value: validated.value } : { raw, issues: validated.issues };
  const next = { ...state, ...NO_LIST, raw, committed: value, showIssues: !validated.ok, edited: false, failed: undefined, session: validated.ok ? undefined : state.session };
  return cancel({ state: next, commit: { value } }, state);
}

/** Commits an alternative: it's another reading of the committed text, so `raw` stays what was typed. */
function choose<T>(env: ExternalFieldEnv<T>, state: ExternalFieldState<T>, chosen: T): ExternalTransition<T> {
  const source = !state.edited && state.committed ? state.committed.raw : state.raw;
  const validated = validate(env.codec, chosen);
  const value: QuantoValue<T> = validated.ok ? { raw: source, value: validated.value } : { raw: source, issues: validated.issues };
  const shown = (env.display !== 'raw' && validated.ok ? tryFormat(env, validated.value) : undefined) ?? source;
  // The value it replaces becomes an alternative, so the choice can be undone.
  const readings = [...(state.committed && 'value' in state.committed && !state.edited ? [state.committed.value] : []), ...state.alternatives];
  const alternatives = readings.filter((reading) => JSON.stringify(reading) !== JSON.stringify(chosen));
  const next = { ...state, raw: shown, committed: value, alternatives, highlighted: undefined, showIssues: !validated.ok, edited: false, failed: undefined, session: validated.ok ? undefined : state.session };
  return cancel({ state: next, commit: { value } }, state);
}

/** Chooses an entry of the list: an alternative is chosen, a known completion picked, a lazy one fetched. */
function select<T>(env: ExternalFieldEnv<T>, state: ExternalFieldState<T>, index: number): ExternalTransition<T> {
  const entry = entries(state)[index];
  if (!entry) return { state };
  if (entry.kind === 'alternative') return choose(env, state, entry.value);
  const { completion } = entry;
  if ('value' in completion) return pick(env, state, completion.value);
  return fetchCompletion(state, completion);
}

/** Starts fetching a chosen completion's value. Whatever is in flight is superseded by the choice. */
function fetchCompletion<T>(state: ExternalFieldState<T>, completion: Completion<T>): ExternalTransition<T> {
  const id = state.nextId;
  const cancelled = cancel({ state }, state);
  const next = { ...cancelled.state, resolving: { id, completion }, failed: undefined, highlighted: undefined, nextId: id + 1 };
  return { ...cancelled, state: next, resolve: { id, completion, session: state.session } };
}

/** The pure transition function. Never throws on user input or a failed service. */
export function reduceExternal<T>(env: ExternalFieldEnv<T>, state: ExternalFieldState<T>, event: ExternalFieldEvent<T>): ExternalTransition<T> {
  switch (event.type) {
    case 'input': {
      // Editing makes everything in flight stale. Issues stay until the next commit settles. Text can only
      // change in a focused input, so an edit that arrives without a focus event (autofill, automation)
      // counts as focus.
      let next: ExternalFieldState<T> = { ...state, raw: event.raw, focused: true, edited: true, failed: undefined, alternatives: [], highlighted: undefined, dismissed: false };
      if (!env.completions) return cancel({ state: next }, state);
      const session = state.session ?? state.nextSession;
      next = { ...next, session, nextSession: state.session === undefined ? state.nextSession + 1 : state.nextSession };
      const transition = cancel({ state: next }, state);
      // Completions stay until new ones arrive, so the list doesn't flicker, except for blank text.
      if (event.raw.trim() === '' || !env.codec.complete) return { ...transition, state: { ...transition.state, completions: [] } };
      const id = transition.state.nextId;
      return { ...transition, state: { ...transition.state, completing: id, nextId: id + 1 }, complete: { id, text: event.raw, session } };
    }
    case 'compositionStart':
      return { state: { ...state, composing: true } };
    case 'compositionEnd':
      return reduceExternal(env, { ...state, composing: false }, { type: 'input', raw: event.raw });
    case 'focus':
      // The committed raw is what was typed. It stays unedited, so it's never re-parsed and can't re-commit.
      if (env.restoreOnEdit && !state.edited && state.committed) return { state: { ...state, raw: state.committed.raw, focused: true } };
      return { state: { ...state, focused: true } };
    case 'blur':
      return commit(env, { ...state, focused: false, composing: false, highlighted: undefined }, 'blur');
    case 'enter':
      if (state.composing) return { state };
      if (isOpen(env, state) && state.highlighted !== undefined) return select(env, state, state.highlighted);
      // After a chosen completion's fetch failed, the text is still what was committed, so there's
      // nothing to parse: Enter fetches the completion again, as `retry` does.
      if (!state.edited && state.failed?.completion) return fetchCompletion(state, state.failed.completion);
      return commit(env, state, 'enter');
    case 'commit':
      return state.composing ? { state } : commit(env, state, 'enter');
    case 'retry':
      if (state.failed?.completion) return fetchCompletion(state, state.failed.completion);
      return state.failed ? commit(env, state, state.focused ? 'enter' : 'blur') : { state };
    case 'resolved':
      if (state.pending?.id !== event.id) return { state };
      return resolve(env, state, state.pending.trigger, event.result);
    case 'rejected':
      // Nothing commits: the text stays edited, so the next blur or Enter (or a retry) parses it again.
      if (state.pending?.id !== event.id) return { state };
      return { state: { ...state, pending: undefined, failed: { error: event.error } } };
    case 'completed':
      if (state.completing !== event.id) return { state };
      return { state: { ...state, completing: undefined, completions: event.completions, highlighted: undefined } };
    case 'completeFailed':
      if (state.completing !== event.id) return { state };
      return { state: { ...state, completing: undefined, completions: [], highlighted: undefined } };
    case 'picked':
      if (state.resolving?.id !== event.id) return { state };
      return pick(env, { ...state, resolving: undefined }, event.value);
    case 'pickFailed':
      // Nothing commits and the text stays; `retry` fetches the same completion again.
      if (state.resolving?.id !== event.id) return { state };
      return { state: { ...state, resolving: undefined, failed: { error: event.error, completion: state.resolving.completion } } };
    case 'pick':
      return pick(env, state, event.value);
    case 'choose':
      return choose(env, state, event.value);
    case 'select':
      return select(env, state, event.index);
    case 'move': {
      const count = entries(state).length;
      if (state.composing || !env.completions || count === 0) return { state };
      const from = state.dismissed ? undefined : state.highlighted;
      const highlighted = from === undefined ? (event.by === 1 ? 0 : count - 1) : (from + event.by + count) % count;
      return { state: { ...state, highlighted, dismissed: false } };
    }
    case 'highlight':
      return { state: { ...state, highlighted: event.index } };
    case 'dismiss':
      return { state: { ...state, dismissed: true, highlighted: undefined } };
    case 'external': {
      const value = event.value ?? undefined;
      if (sameEnvelope(value, state.committed)) return { state };
      // Local edits win, including one whose parse is still in flight after a blur, and a chosen
      // completion being fetched: a value that arrives then is dropped, not queued.
      if (state.resolving || (state.edited && (state.focused || state.pending))) return { state };
      const next = value === undefined ? { ...state, ...NO_LIST, raw: '', committed: undefined, showIssues: false, edited: false, failed: undefined, session: undefined } : fromEnvelope(env, state, value);
      return cancel({ state: next }, state, ['completing']);
    }
  }
}
