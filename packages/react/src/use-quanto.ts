import { useEffect, useId, useRef, useState, type ChangeEvent, type CompositionEvent, type HTMLAttributes, type KeyboardEvent } from 'react';
import type { Codec, Ctx, Issue, ParseContext, QuantoValue } from 'quanto';
import { useQuantoCtx } from './context';
import { echo as computeEcho, initialState, reduce, type Display, type Echo, type FieldEnv, type FieldEvent, type FieldState } from './field';

export interface UseQuantoOptions<T> {
  /**
   * Controlled: the envelope to show. A change that arrives while someone is editing is dropped, not
   * queued: their text wins, and their commit on blur reaches you through `onChange`.
   */
  readonly value?: QuantoValue<T> | null | undefined;
  /** Uncontrolled: the starting value, shown formatted unless `defaultRaw` is given. */
  readonly defaultValue?: T | undefined;
  /** With `defaultValue`: the text to restore exactly, with no re-parse. */
  readonly defaultRaw?: string | undefined;
  /**
   * Fires on commit (blur, Enter, a pick), never per keystroke, with the envelope to store: `{ raw, value }`,
   * or `{ raw, issues }` when the text didn't parse. `context` is set when it parsed, for apps that store
   * it for replay.
   */
  readonly onChange?: ((value: QuantoValue<T>, meta: { readonly context?: ParseContext | undefined }) => void) | undefined;
  /** What the input shows after a commit. Default `formatted-on-blur`; use `raw` with a display-only formatter. */
  readonly display?: Display | undefined;
  /**
   * With a formatted display: focusing the field puts back the text that was typed, so people edit their
   * own words rather than the formatted value. Leaving it unedited shows the formatted value again.
   */
  readonly restoreOnEdit?: boolean | undefined;
  /** Overrides the `QuantoProvider` context for this field. */
  readonly ctx?: Ctx | undefined;
}

/** Props to spread on an `<input>`. Add your own `id`, `name`, `className` and so on alongside. */
export interface QuantoInputProps {
  readonly value: string;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly onCompositionStart: () => void;
  readonly onCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => void;
  readonly inputMode: HTMLAttributes<HTMLInputElement>['inputMode'];
  readonly 'aria-invalid': boolean;
  readonly 'aria-describedby': string;
}

export interface QuantoField<T> {
  readonly inputProps: QuantoInputProps;
  /**
   * The live interpretation of the text while typing, or undefined. Never stored. It's there even when it
   * only repeats the text, since its value and alternatives are still the reading; use `showEcho` to
   * decide whether to display its text.
   */
  readonly echo: Echo<T> | undefined;
  /** Whether to display the echo's text: it adds something (it isn't the text as typed) and no issues show. */
  readonly showEcho: boolean;
  /** Issues from the last commit, shown until the text parses again. Empty otherwise. */
  readonly issues: readonly Issue[];
  /** The last committed envelope. */
  readonly value: QuantoValue<T> | undefined;
  readonly focused: boolean;
  /** Sets the value from a picker: the text becomes `format(value)`, and it commits. */
  readonly pick: (value: T) => void;
  /** Commits the current text now, as a blur would but keeping focus. */
  readonly commit: () => void;
  /** Element ids for the echo and the issues; `inputProps['aria-describedby']` points at both. */
  readonly ids: { readonly echo: string; readonly issues: string };
}

/**
 * The quanto field as a hook: owns the text, parses on commit, and emits `{ raw, value }`. Use it to
 * build your own input; `QuantoInput` is built on it. The codec needn't be stable across renders.
 */
export function useQuanto<T>(codec: Codec<T>, options: UseQuantoOptions<T> = {}): QuantoField<T> {
  if ((codec as { external?: unknown }).external === true) {
    throw new Error(`quanto: useQuanto() got the external codec "${codec.id}". It parses on commit only, through its service: use useExternalQuanto() or QuantoInput.`);
  }
  const providerCtx = useQuantoCtx();
  const env: FieldEnv<T> = { codec, ctx: options.ctx ?? providerCtx, display: options.display ?? 'formatted-on-blur', restoreOnEdit: options.restoreOnEdit };
  const envRef = useRef(env);
  envRef.current = env;
  const onChangeRef = useRef(options.onChange);
  onChangeRef.current = options.onChange;

  const [state, setState] = useState<FieldState<T>>(() =>
    initialState(env, { value: options.value ?? undefined, defaultValue: options.defaultValue, defaultRaw: options.defaultRaw }),
  );
  const stateRef = useRef(state);

  const dispatch = (event: FieldEvent<T>): void => {
    const { state: next, commit } = reduce(envRef.current, stateRef.current, event);
    stateRef.current = next;
    setState(next);
    if (commit) onChangeRef.current?.(commit.value, { context: commit.context });
  };

  const controlled = 'value' in options;
  useEffect(() => {
    if (controlled) dispatch({ type: 'external', value: options.value });
    // Only a new controlled value is an external change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, options.value]);

  const id = useId();
  const ids = { echo: `${id}-echo`, issues: `${id}-issues` };
  const issues = state.showIssues && state.committed && 'issues' in state.committed ? state.committed.issues : [];
  const echo = computeEcho(env, state);

  return {
    inputProps: {
      value: state.raw,
      onChange: (event) => dispatch({ type: 'input', raw: event.target.value }),
      onFocus: () => dispatch({ type: 'focus' }),
      onBlur: () => dispatch({ type: 'blur' }),
      // Enter commits and is left to bubble, so a form still submits with the committed value.
      onKeyDown: (event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) dispatch({ type: 'enter' });
      },
      onCompositionStart: () => dispatch({ type: 'compositionStart' }),
      onCompositionEnd: (event) => dispatch({ type: 'compositionEnd', raw: event.currentTarget.value }),
      // Heights need ' and ", which a numeric keypad can't type.
      inputMode: 'text',
      'aria-invalid': issues.length > 0,
      'aria-describedby': `${ids.echo} ${ids.issues}`,
    },
    echo,
    showEcho: echo !== undefined && issues.length === 0 && echo.text !== state.raw.trim(),
    issues,
    value: state.committed,
    focused: state.focused,
    pick: (value) => dispatch({ type: 'pick', value }),
    commit: () => dispatch({ type: 'enter' }),
    ids,
  };
}
