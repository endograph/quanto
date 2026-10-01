import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { isInvalidValueError, type Completion, type Ctx, type ExternalCodec, type Issue, type QuantoValue } from 'quanto';
import { useQuantoCtx } from './context';
import {
  entries,
  initialExternalState,
  isOpen,
  reduceExternal,
  type ExternalFieldEnv,
  type ExternalFieldEvent,
  type ExternalFieldState,
  type ExternalTransition,
} from './external-field';
import type { QuantoInputProps, UseQuantoOptions } from './use-quanto';

/** Options for `useExternalQuanto`: `useQuanto`'s, plus completions. */
export interface UseExternalQuantoOptions<T> extends UseQuantoOptions<T> {
  /**
   * You render the completion list: ask the codec for completions while typing (if it has `complete`),
   * and return `completions` to build the list with. Off by default, since the input's combobox
   * attributes are only right with a list beside it, and a billed service shouldn't be asked for
   * completions nobody sees.
   */
  readonly completions?: boolean | undefined;
  /** How long typing pauses before completions are asked for, in milliseconds. Default 150. */
  readonly completionDelay?: number | undefined;
}

/**
 * Props to spread on an `<input>`: `useQuanto`'s, plus `aria-busy` while a parse is pending, and with
 * `completions` on, the combobox attributes.
 */
export interface ExternalQuantoInputProps extends QuantoInputProps {
  readonly 'aria-busy': boolean;
  readonly role?: 'combobox' | undefined;
  readonly 'aria-expanded'?: boolean | undefined;
  readonly 'aria-controls'?: string | undefined;
  readonly 'aria-activedescendant'?: string | undefined;
  readonly 'aria-autocomplete'?: 'list' | undefined;
}

/**
 * An entry in the completion list. An alternative is another reading of the committed text: choosing it
 * keeps `raw`. A completion is a candidate value: choosing it is a pick, so the text becomes the
 * formatted value. `key` is for React; it's the completion's `id` when it has one.
 */
export type CompletionItem<T> =
  | { readonly kind: 'alternative'; readonly key: string; readonly label: string; readonly value: T }
  | { readonly kind: 'completion'; readonly key: string; readonly label: string; readonly completion: Completion<T> };

/** Props to spread on the list's element. */
export interface CompletionListProps {
  readonly id: string;
  readonly role: 'listbox';
  /** Keeps focus in the input, so choosing with the pointer isn't a blur (which would start a parse). */
  readonly onMouseDown: (event: MouseEvent) => void;
}

/** Props to spread on an item's element. Add `key={item.key}` yourself. */
export interface CompletionItemProps {
  readonly id: string;
  readonly role: 'option';
  readonly 'aria-selected': boolean;
  readonly onMouseDown: (event: MouseEvent) => void;
  readonly onMouseEnter: () => void;
  readonly onClick: () => void;
}

/** The completion list, for you to render. See `UseExternalQuantoOptions.completions`. */
export interface ExternalQuantoCompletions<T> {
  /** Whether to show the list: the field is focused, there's something to show, and Escape didn't close it. */
  readonly open: boolean;
  /** The last commit's alternatives, then the completions for the text. */
  readonly items: readonly CompletionItem<T>[];
  readonly highlighted: CompletionItem<T> | undefined;
  /** A chosen completion's value is being fetched. */
  readonly resolving: boolean;
  readonly listProps: CompletionListProps;
  readonly itemProps: (item: CompletionItem<T>) => CompletionItemProps;
  /** Chooses an item, as a click on it does. */
  readonly select: (item: CompletionItem<T>) => void;
}

export interface ExternalQuantoField<T> {
  readonly inputProps: ExternalQuantoInputProps;
  /** Issues from the last commit, shown until the next commit settles. Empty otherwise. */
  readonly issues: readonly Issue[];
  /** The last committed envelope. */
  readonly value: QuantoValue<T> | undefined;
  readonly focused: boolean;
  /** A parse is in flight. */
  readonly pending: boolean;
  /** The last parse, or the fetch of a chosen completion, rejected: the service couldn't answer. The text is kept and nothing committed. */
  readonly failed: boolean;
  /** What it rejected with, when `failed`. */
  readonly error: unknown;
  /** Starts again whatever failed. The next blur or Enter parses again too; when to retry is up to you. */
  readonly retry: () => void;
  /**
   * Resolves once nothing is in flight (a parse, or a chosen completion's fetch), with the committed
   * envelope; rejects with the service's error if that failed (or with `ctx.signal`'s reason if that
   * cancelled it), and with an `AbortError` if the field is unmounted or hidden (`<Activity>`) first.
   * Await it before submitting a form.
   */
  readonly settled: () => Promise<QuantoValue<T> | undefined>;
  /** Sets the value from a picker: the text becomes `format(value)`, and it commits without a parse. */
  readonly pick: (value: T) => void;
  /** Other readings of the committed text: a success's, or an `ambiguous` failure's. Never stored. */
  readonly alternatives: readonly T[];
  /** Chooses an alternative: it becomes the value, and `raw` stays what was typed. */
  readonly choose: (value: T) => void;
  /** Commits the current text now, as a blur would but keeping focus. */
  readonly commit: () => void;
  /** The completion list, with the `completions` option on; undefined otherwise. */
  readonly completions: ExternalQuantoCompletions<T> | undefined;
  /** The element id for the issues; `inputProps['aria-describedby']` points at it. */
  readonly ids: { readonly issues: string };
}

/**
 * A signal that aborts when either does, with that one's reason. The hook's own controller aborts
 * superseded requests; the caller's (`ctx.signal`) cancels from outside, a form-level timeout say.
 */
function eitherSignal(own: AbortSignal, caller: AbortSignal | undefined): { readonly signal: AbortSignal; readonly release: () => void } {
  if (!caller) return { signal: own, release: () => {} };
  const both = new AbortController();
  const listeners: Array<() => void> = [];
  for (const signal of [caller, own]) {
    if (signal.aborted) both.abort(signal.reason);
    const listener = () => both.abort(signal.reason);
    signal.addEventListener('abort', listener, { once: true });
    listeners.push(() => signal.removeEventListener('abort', listener));
  }
  // A long-lived caller signal (a provider's) would otherwise collect a listener per request.
  return { signal: both.signal, release: () => listeners.forEach((remove) => remove()) };
}

/** A session token for a service: a UUID where the platform has one. */
const newToken = (n: number): string => globalThis.crypto?.randomUUID?.() ?? `quanto-${Date.now().toString(36)}-${n}`;

interface Waiter<T> {
  readonly resolve: (value: QuantoValue<T> | undefined) => void;
  readonly reject: (error: unknown) => void;
}

/** What a request does once started: the outcome to dispatch, given the signal and session to pass on. */
type Work<T> = (ctx: Ctx) => Promise<ExternalFieldEvent<T>>;

const keepFocus = (event: MouseEvent): void => event.preventDefault();

/**
 * The field for an external codec, as a hook: owns the text, parses on commit only (blur, Enter), and
 * emits `{ raw, value }`. There's no live echo, since every parse calls the service. Editing aborts the
 * parse in flight. Use it to build your own input; `QuantoInput` is built on it. With `completions` on,
 * it also asks for completions while typing and returns the list's state and props for you to render.
 */
export function useExternalQuanto<T>(codec: ExternalCodec<T>, options: UseExternalQuantoOptions<T> = {}): ExternalQuantoField<T> {
  if (codec.external !== true) throw new Error(`quanto: useExternalQuanto() got the codec "${codec.id}", which isn't external. Use useQuanto() for it.`);
  const providerCtx = useQuantoCtx();
  const env: ExternalFieldEnv<T> = {
    codec,
    ctx: options.ctx ?? providerCtx,
    display: options.display ?? 'formatted-on-blur',
    restoreOnEdit: options.restoreOnEdit,
    completions: options.completions,
  };
  const envRef = useRef(env);
  envRef.current = env;
  const onChangeRef = useRef(options.onChange);
  onChangeRef.current = options.onChange;
  const delayRef = useRef(options.completionDelay ?? 150);
  delayRef.current = options.completionDelay ?? 150;

  const [state, setState] = useState<ExternalFieldState<T>>(() =>
    initialExternalState(env, { value: options.value ?? undefined, defaultValue: options.defaultValue, defaultRaw: options.defaultRaw }),
  );
  const stateRef = useRef(state);
  const controllers = useRef(new Map<number, AbortController>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const tokens = useRef(new Map<number, string>());
  const waiters = useRef<Waiter<T>[]>([]);

  const busy = (s: ExternalFieldState<T>): boolean => s.pending !== undefined || s.resolving !== undefined;

  /** Settles `settled()` callers once nothing is in flight. */
  const flush = (next: ExternalFieldState<T>): void => {
    if (busy(next) || waiters.current.length === 0) return;
    const pending = waiters.current;
    waiters.current = [];
    for (const waiter of pending) {
      if (next.failed) waiter.reject(next.failed.error);
      else waiter.resolve(next.committed);
    }
  };

  /** The token for session `n`, made the first time it's needed. */
  const token = (n: number | undefined): string | undefined => {
    if (n === undefined) return undefined;
    let t = tokens.current.get(n);
    if (t === undefined) {
      t = newToken(n);
      tokens.current.set(n, t);
    }
    return t;
  };

  /**
   * Starts request `id`, after `delay` if given, and dispatches its outcome. A request the hook aborted
   * was already dropped by the machine; one the caller's signal aborted wasn't, so its rejection is
   * dispatched and the field settles as failed.
   */
  const start = (id: number, session: number | undefined, work: Work<T>, onError: (error: unknown) => ExternalFieldEvent<T>, delay?: number): void => {
    const controller = new AbortController();
    controllers.current.set(id, controller);
    const run = (): void => {
      timers.current.delete(id);
      const { ctx } = envRef.current;
      const { signal, release } = eitherSignal(controller.signal, ctx?.signal as AbortSignal | undefined);
      const sessionToken = token(session);
      const done = (event: ExternalFieldEvent<T>): void => {
        release();
        // A resumed request reuses its id (see the effect below), so only remove this one's own entry.
        if (controllers.current.get(id) === controller) controllers.current.delete(id);
        if (!controller.signal.aborted) dispatch(event);
      };
      Promise.resolve()
        .then(() => work({ ...ctx, signal, ...(sessionToken !== undefined ? { session: sessionToken } : {}) }))
        .then(done, (error: unknown) => done(onError(error)));
    };
    if (delay && delay > 0) timers.current.set(id, setTimeout(run, delay));
    else run();
  };

  const stop = (id: number): void => {
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
  };

  const runParse = (request: { readonly id: number; readonly text: string; readonly session?: number | undefined }): void =>
    start(request.id, request.session, async (ctx) => ({ type: 'resolved', id: request.id, result: await envRef.current.codec.parse(request.text, ctx) }), (error) => ({ type: 'rejected', id: request.id, error }));

  const runComplete = (request: { readonly id: number; readonly text: string; readonly session?: number | undefined }, delay: number): void =>
    start(
      request.id,
      request.session,
      async (ctx) => ({ type: 'completed', id: request.id, completions: (await envRef.current.codec.complete?.(request.text, ctx)) ?? [] }),
      () => ({ type: 'completeFailed', id: request.id }),
      delay,
    );

  const runFetch = (request: { readonly id: number; readonly completion: Completion<T>; readonly session?: number | undefined }): void => {
    const { completion } = request;
    start(
      request.id,
      request.session,
      async (ctx) => ({ type: 'picked', id: request.id, value: 'value' in completion ? completion.value : await completion.resolve(ctx) }),
      (error) => ({ type: 'pickFailed', id: request.id, error }),
    );
  };

  const apply = (transition: ExternalTransition<T>): void => {
    stateRef.current = transition.state;
    setState(transition.state);
    for (const id of transition.abort ?? []) stop(id);
    if (transition.request) runParse(transition.request);
    if (transition.complete) runComplete(transition.complete, delayRef.current);
    if (transition.resolve) runFetch(transition.resolve);
    if (transition.commit) onChangeRef.current?.(transition.commit.value, { context: transition.commit.context });
    flush(transition.state);
  };

  const dispatch = (event: ExternalFieldEvent<T>): void => apply(reduceExternal(envRef.current, stateRef.current, event));

  // Whether the effect below is set up. React can tear it down and set it up again while keeping state
  // (StrictMode, a hidden <Activity>), so the field can be detached without being gone.
  const attached = useRef(false);
  useEffect(() => {
    attached.current = true;
    // Requests the last cleanup cancelled are still in the state: start them again, under the same ids,
    // so the field picks up where it left off.
    const current = stateRef.current;
    if (current.pending && !controllers.current.has(current.pending.id)) runParse({ id: current.pending.id, text: current.raw, session: current.session });
    if (current.resolving && !controllers.current.has(current.resolving.id)) runFetch({ ...current.resolving, session: current.session });
    if (current.completing !== undefined && !controllers.current.has(current.completing)) runComplete({ id: current.completing, text: current.raw, session: current.session }, 0);
    const inFlight = controllers.current;
    const waiting = timers.current;
    return () => {
      attached.current = false;
      for (const controller of inFlight.values()) controller.abort();
      inFlight.clear();
      for (const timer of waiting.values()) clearTimeout(timer);
      waiting.clear();
      // Nothing will settle the field now, so a submit awaiting it is told so rather than left hanging.
      const pending = waiters.current;
      waiters.current = [];
      const reason = new DOMException('The field was unmounted or hidden while a parse was pending.', 'AbortError');
      for (const waiter of pending) waiter.reject(reason);
    };
  }, []);

  const controlled = 'value' in options;
  useEffect(() => {
    if (controlled) dispatch({ type: 'external', value: options.value });
    // Only a new controlled value is an external change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, options.value]);

  const id = useId();
  const ids = { issues: `${id}-issues` };
  const listId = `${id}-completions`;
  const itemId = (index: number): string => `${id}-completion-${index}`;
  const issues = state.showIssues && state.committed && 'issues' in state.committed ? state.committed.issues : [];

  const label = (value: T): string => {
    try {
      return codec.format(value, env.ctx);
    } catch (error) {
      if (isInvalidValueError(error)) return JSON.stringify(value);
      throw error;
    }
  };
  const items: CompletionItem<T>[] = entries(state).map((entry, index) =>
    entry.kind === 'alternative'
      ? { kind: 'alternative', key: `alternative-${index}`, label: label(entry.value), value: entry.value }
      : { kind: 'completion', key: entry.completion.id ?? `completion-${index}`, label: entry.completion.label, completion: entry.completion },
  );
  const open = isOpen(env, state);
  const highlighted = open && state.highlighted !== undefined ? items[state.highlighted] : undefined;
  const select = (item: CompletionItem<T>): void => {
    const index = items.indexOf(item);
    if (index >= 0) dispatch({ type: 'select', index });
  };

  const completions: ExternalQuantoCompletions<T> | undefined = options.completions
    ? {
        open,
        items,
        highlighted,
        resolving: state.resolving !== undefined,
        listProps: { id: listId, role: 'listbox', onMouseDown: keepFocus },
        itemProps: (item) => {
          const index = items.indexOf(item);
          return {
            id: itemId(index),
            role: 'option',
            'aria-selected': highlighted === item,
            onMouseDown: keepFocus,
            onMouseEnter: () => dispatch({ type: 'highlight', index }),
            onClick: () => select(item),
          };
        },
        select,
      }
    : undefined;

  const combobox = options.completions
    ? {
        role: 'combobox' as const,
        'aria-expanded': open,
        'aria-controls': listId,
        'aria-activedescendant': highlighted ? itemId(items.indexOf(highlighted)) : undefined,
        'aria-autocomplete': 'list' as const,
      }
    : {};

  return {
    inputProps: {
      value: state.raw,
      onChange: (event) => dispatch({ type: 'input', raw: event.target.value }),
      onFocus: () => dispatch({ type: 'focus' }),
      onBlur: () => dispatch({ type: 'blur' }),
      onKeyDown: (event) => {
        const current = stateRef.current;
        // Candidate navigation belongs to the IME until composition finishes.
        if (current.composing || event.nativeEvent.isComposing) return;
        const listing = options.completions === true && entries(current).length > 0;
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && listing) {
          event.preventDefault();
          dispatch({ type: 'move', by: event.key === 'ArrowDown' ? 1 : -1 });
        } else if (event.key === 'Escape' && isOpen(envRef.current, current)) {
          event.preventDefault();
          dispatch({ type: 'dismiss' });
        } else if (event.key === 'Enter') {
          // Enter on a highlighted entry chooses it, and mustn't also submit a form. Otherwise it commits
          // and is left to bubble: whether a form may submit while a parse is pending is the app's call
          // (await `settled()`).
          if (isOpen(envRef.current, current) && current.highlighted !== undefined) event.preventDefault();
          dispatch({ type: 'enter' });
        }
      },
      onCompositionStart: () => dispatch({ type: 'compositionStart' }),
      onCompositionEnd: (event) => dispatch({ type: 'compositionEnd', raw: event.currentTarget.value }),
      inputMode: 'text',
      'aria-invalid': issues.length > 0,
      'aria-describedby': ids.issues,
      'aria-busy': busy(state),
      ...combobox,
    },
    issues,
    value: state.committed,
    focused: state.focused,
    pending: state.pending !== undefined,
    failed: state.failed !== undefined,
    error: state.failed?.error,
    retry: () => dispatch({ type: 'retry' }),
    settled: () => {
      const current = stateRef.current;
      // Detached, nothing is running to settle it.
      if (busy(current) && !attached.current) return Promise.reject(new DOMException('The field was unmounted or hidden while a parse was pending.', 'AbortError'));
      if (busy(current)) return new Promise((resolve, reject) => waiters.current.push({ resolve, reject }));
      return current.failed ? Promise.reject(current.failed.error) : Promise.resolve(current.committed);
    },
    pick: (value) => dispatch({ type: 'pick', value }),
    alternatives: state.alternatives,
    choose: (value) => dispatch({ type: 'choose', value }),
    commit: () => dispatch({ type: 'commit' }),
    completions,
    ids,
  };
}
