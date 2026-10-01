import { useEffect, useId, useRef, useState } from 'react';
import type { ExternalCodec, Issue, QuantoValue } from 'quanto';
import { useQuantoCtx } from './context';
import { initialExternalState, reduceExternal, type ExternalFieldEnv, type ExternalFieldEvent, type ExternalFieldState } from './external-field';
import type { QuantoInputProps, UseQuantoOptions } from './use-quanto';

/** Options for `useExternalQuanto`: the same as `useQuanto`'s. */
export type UseExternalQuantoOptions<T> = UseQuantoOptions<T>;

/** Props to spread on an `<input>`: `useQuanto`'s, plus `aria-busy` while a parse is pending. */
export interface ExternalQuantoInputProps extends QuantoInputProps {
  readonly 'aria-busy': boolean;
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
  /** The last parse rejected: the service couldn't answer. The text is kept and nothing committed. */
  readonly failed: boolean;
  /** What the last parse rejected with, when `failed`. */
  readonly error: unknown;
  /** Parses the text again after a failure. The next blur or Enter does too; when to retry is up to you. */
  readonly retry: () => void;
  /**
   * Resolves once no parse is in flight, with the committed envelope; rejects with the service's error
   * if that parse failed (or with `ctx.signal`'s reason if that cancelled it), and with an `AbortError`
   * if the field is unmounted or hidden (`<Activity>`) first. Await it before submitting a form.
   */
  readonly settled: () => Promise<QuantoValue<T> | undefined>;
  /** Sets the value from a picker: the text becomes `format(value)`, and it commits without a parse. */
  readonly pick: (value: T) => void;
  /** Commits the current text now, as a blur would but keeping focus. */
  readonly commit: () => void;
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

interface Waiter<T> {
  readonly resolve: (value: QuantoValue<T> | undefined) => void;
  readonly reject: (error: unknown) => void;
}

/**
 * The field for an external codec, as a hook: owns the text, parses on commit only (blur, Enter), and
 * emits `{ raw, value }`. There's no live echo, since every parse calls the service. Editing aborts the
 * parse in flight. Use it to build your own input; `QuantoInput` is built on it.
 */
export function useExternalQuanto<T>(codec: ExternalCodec<T>, options: UseExternalQuantoOptions<T> = {}): ExternalQuantoField<T> {
  if (codec.external !== true) throw new Error(`quanto: useExternalQuanto() got the codec "${codec.id}", which isn't external. Use useQuanto() for it.`);
  const providerCtx = useQuantoCtx();
  const env: ExternalFieldEnv<T> = { codec, ctx: options.ctx ?? providerCtx, display: options.display ?? 'formatted-on-blur', restoreOnEdit: options.restoreOnEdit };
  const envRef = useRef(env);
  envRef.current = env;
  const onChangeRef = useRef(options.onChange);
  onChangeRef.current = options.onChange;

  const [state, setState] = useState<ExternalFieldState<T>>(() =>
    initialExternalState(env, { value: options.value ?? undefined, defaultValue: options.defaultValue, defaultRaw: options.defaultRaw }),
  );
  const stateRef = useRef(state);
  const controllers = useRef(new Map<number, AbortController>());
  const waiters = useRef<Waiter<T>[]>([]);

  /** Settles `settled()` callers once nothing is in flight. */
  const flush = (next: ExternalFieldState<T>): void => {
    if (next.pending || waiters.current.length === 0) return;
    const pending = waiters.current;
    waiters.current = [];
    for (const waiter of pending) {
      if (next.failed) waiter.reject(next.failed.error);
      else waiter.resolve(next.committed);
    }
  };

  const run = (request: { readonly id: number; readonly text: string }): void => {
    const controller = new AbortController();
    controllers.current.set(request.id, controller);
    const { codec: current, ctx } = envRef.current;
    const { signal, release } = eitherSignal(controller.signal, ctx?.signal as AbortSignal | undefined);
    const done = (event: ExternalFieldEvent<T>): void => {
      release();
      // A resumed request reuses its id (see the effect below), so only remove this one's own entry.
      if (controllers.current.get(request.id) === controller) controllers.current.delete(request.id);
      // A request the hook aborted was already dropped by the machine. One the caller's signal aborted
      // wasn't: it comes back as a rejection, so the field settles as failed.
      if (!controller.signal.aborted) dispatch(event);
    };
    Promise.resolve()
      .then(() => current.parse(request.text, { ...ctx, signal }))
      .then(
        (result) => done({ type: 'resolved', id: request.id, result }),
        (error: unknown) => done({ type: 'rejected', id: request.id, error }),
      );
  };

  const dispatch = (event: ExternalFieldEvent<T>): void => {
    const transition = reduceExternal(envRef.current, stateRef.current, event);
    stateRef.current = transition.state;
    setState(transition.state);
    if (transition.abort !== undefined) {
      controllers.current.get(transition.abort)?.abort();
      controllers.current.delete(transition.abort);
    }
    if (transition.request) run(transition.request);
    if (transition.commit) onChangeRef.current?.(transition.commit.value, { context: transition.commit.context });
    flush(transition.state);
  };

  // Whether the effect below is set up. React can tear it down and set it up again while keeping state
  // (StrictMode, a hidden <Activity>), so the field can be detached without being gone.
  const attached = useRef(false);
  useEffect(() => {
    attached.current = true;
    // A parse the last cleanup cancelled is still pending in the state: start it again, under the same
    // id, so the field picks up where it left off.
    const pending = stateRef.current.pending;
    if (pending && !controllers.current.has(pending.id)) run({ id: pending.id, text: stateRef.current.raw });
    const inFlight = controllers.current;
    return () => {
      attached.current = false;
      for (const controller of inFlight.values()) controller.abort();
      inFlight.clear();
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
  const issues = state.showIssues && state.committed && 'issues' in state.committed ? state.committed.issues : [];

  return {
    inputProps: {
      value: state.raw,
      onChange: (event) => dispatch({ type: 'input', raw: event.target.value }),
      onFocus: () => dispatch({ type: 'focus' }),
      onBlur: () => dispatch({ type: 'blur' }),
      // Enter commits and is left to bubble: whether a form may submit while a parse is pending is the
      // app's call (await `settled()`).
      onKeyDown: (event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) dispatch({ type: 'enter' });
      },
      onCompositionStart: () => dispatch({ type: 'compositionStart' }),
      onCompositionEnd: (event) => dispatch({ type: 'compositionEnd', raw: event.currentTarget.value }),
      inputMode: 'text',
      'aria-invalid': issues.length > 0,
      'aria-describedby': ids.issues,
      'aria-busy': state.pending !== undefined,
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
      if (current.pending && !attached.current) return Promise.reject(new DOMException('The field was unmounted or hidden while a parse was pending.', 'AbortError'));
      if (current.pending) return new Promise((resolve, reject) => waiters.current.push({ resolve, reject }));
      return current.failed ? Promise.reject(current.failed.error) : Promise.resolve(current.committed);
    },
    pick: (value) => dispatch({ type: 'pick', value }),
    commit: () => dispatch({ type: 'enter' }),
    ids,
  };
}
