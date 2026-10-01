import type { ComponentType, InputHTMLAttributes, ReactNode, Ref } from 'react';
import { isExternalCodec, type Codec, type ExternalCodec } from 'quanto';
import { text } from 'quanto/codecs';
import { useExternalQuanto, type ExternalQuantoInputProps } from './use-external-quanto';
import { useQuanto, type UseQuantoOptions } from './use-quanto';

/** What an accessory (a picker button, say) receives. Choosing a value commits it. */
export interface AccessoryProps<T> {
  readonly value: T | undefined;
  readonly onChange: (value: T) => void;
  readonly focused: boolean;
}

export interface QuantoInputComponentProps<T = string>
  extends UseQuantoOptions<T>,
    Omit<InputHTMLAttributes<HTMLInputElement>, keyof ExternalQuantoInputProps | 'defaultValue' | 'type'> {
  /**
   * The codec, sync or external. Without one, the field is plain text: `text()`, the trimmed string as
   * typed. An external codec parses on commit only, through its service, and has no echo.
   */
  readonly codec?: Codec<T> | ExternalCodec<T> | undefined;
  /** Rendered after the input, e.g. a calendar button that opens a picker. Text entry stays available. */
  readonly accessory?: ComponentType<AccessoryProps<T>> | undefined;
  /** With an external codec: shown in the alert region when the service couldn't answer. */
  readonly failedMessage?: string | undefined;
  /** The keyboard hint. Default `text`. */
  readonly inputMode?: ExternalQuantoInputProps['inputMode'];
  readonly ref?: Ref<HTMLInputElement> | undefined;
}

const PLAIN_TEXT = text();

/**
 * A text input for any codec. It parses on blur or Enter and calls `onChange` with `{ raw, value }`,
 * showing issues after a failed commit. With a sync codec it shows its interpretation while typing
 * (`5'11` → `5 ft 11 in`). With an external codec it parses through the service on commit only: a
 * failed service keeps the text and commits nothing, and the next blur or Enter tries again.
 *
 * Unstyled: target `[data-quanto]`, `[data-quanto-echo]` and `[data-quanto-issues]`, and for an external
 * codec `[data-quanto-pending]` and `[data-quanto-failed]` while those hold. For anything more, build
 * your own field on `useQuanto` or `useExternalQuanto`.
 */
export function QuantoInput<T = string>(props: QuantoInputComponentProps<T>): ReactNode {
  const codec = props.codec ?? (PLAIN_TEXT as unknown as Codec<T>);
  // Two components, so each calls one hook. A codec that changes kind remounts the field.
  return isExternalCodec(codec) ? <ExternalField {...props} codec={codec} /> : <SyncField {...props} codec={codec} />;
}

function SyncField<T>(props: QuantoInputComponentProps<T> & { readonly codec: Codec<T> }): ReactNode {
  const { codec, value, defaultValue, defaultRaw, onChange, display, restoreOnEdit, ctx, accessory: Accessory, failedMessage: _, inputMode, ref, ...inputAttributes } = props;
  const field = useQuanto(codec, { ...('value' in props ? { value } : {}), defaultValue, defaultRaw, onChange, display, restoreOnEdit, ctx });
  const committed = field.value && 'value' in field.value ? field.value.value : undefined;

  return (
    <span data-quanto="">
      <input {...inputAttributes} {...field.inputProps} inputMode={inputMode ?? field.inputProps.inputMode} type="text" ref={ref} />
      {Accessory ? <Accessory value={committed} onChange={field.pick} focused={field.focused} /> : null}
      <span id={field.ids.echo} data-quanto-echo="">
        {field.showEcho ? field.echo?.text : null}
      </span>
      <span id={field.ids.issues} data-quanto-issues="" role="alert">
        {field.issues.map((issue) => issue.message).join(' ')}
      </span>
    </span>
  );
}

function ExternalField<T>(props: QuantoInputComponentProps<T> & { readonly codec: ExternalCodec<T> }): ReactNode {
  const { codec, value, defaultValue, defaultRaw, onChange, display, restoreOnEdit, ctx, accessory: Accessory, failedMessage, inputMode, ref, ...inputAttributes } = props;
  const field = useExternalQuanto(codec, { ...('value' in props ? { value } : {}), defaultValue, defaultRaw, onChange, display, restoreOnEdit, ctx });
  const committed = field.value && 'value' in field.value ? field.value.value : undefined;
  const alert = field.failed ? (failedMessage ?? `Couldn't check this value. Try again.`) : field.issues.map((issue) => issue.message).join(' ');

  return (
    <span data-quanto="" data-quanto-pending={field.pending ? '' : undefined} data-quanto-failed={field.failed ? '' : undefined}>
      <input {...inputAttributes} {...field.inputProps} inputMode={inputMode ?? field.inputProps.inputMode} type="text" ref={ref} />
      {Accessory ? <Accessory value={committed} onChange={field.pick} focused={field.focused} /> : null}
      <span id={field.ids.issues} data-quanto-issues="" role="alert">
        {alert}
      </span>
    </span>
  );
}
