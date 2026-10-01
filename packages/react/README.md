# quanto-react

A React input for [quanto](../quanto/README.md). People type `5'11`, `180cm` or `1,8 m`; the field shows its interpretation as they type, parses on blur or Enter, and gives you `{ raw, value }` to store.

```tsx
import { QuantoInput, QuantoProvider } from 'quanto-react';
import { length } from 'quanto/codecs';

<QuantoProvider ctx={{ locale: 'en-US' }}>
  <QuantoInput
    codec={length({ defaultUnit: 'in' })}
    onChange={(entry) => {
      // { raw: "5'11", value: { value: 71, unit: 'in' } }, or { raw, issues } if it didn't parse
    }}
  />
</QuantoProvider>
```

- `onChange` fires on commit (blur, Enter, a pick), never per keystroke. Store the whole envelope; `value` is authoritative, and `raw` is never re-parsed.
- `display`: `formatted-on-blur` (default) shows `format(value)` after blur, `formatted` after every commit, `raw` never.
- `restoreOnEdit`: with a formatted `display`, focusing the field puts back the text that was typed. Leaving it unedited shows the formatted value again and doesn't commit.
- Controlled with `value`, or uncontrolled with `defaultValue` and `defaultRaw`. While someone is editing, their text wins: a `value` that arrives then is dropped, and their commit reaches you through `onChange`.
- Unstyled. Target `[data-quanto]`, `[data-quanto-echo]` and `[data-quanto-issues]`.
- Build your own field with `useQuanto(codec, options)`, which returns `inputProps` for any `<input>`, plus `echo` (and `showEcho`, whether it's worth displaying), `issues`, `value`, `pick` and `commit`. Most apps with their own markup or a form library build on the hook; `QuantoInput` is the minimal default.

## External codecs

For a codec built with `defineExternalCodec` (its parse calls a model or a server), pass it to the same `QuantoInput`, or build on `useExternalQuanto`. It takes the same options, and parses on commit only: there's no echo while typing.

```tsx
<QuantoInput codec={recipeYield({ service })} onChange={(entry) => save(entry)} />
```

- While a parse is in flight, `pending` is true, the input has `aria-busy`, and the wrapper has `[data-quanto-pending]`. Editing aborts it.
- If the service fails, nothing commits and the text stays: `failed` and `error` are set, the wrapper has `[data-quanto-failed]`, and the alert region shows `failedMessage`. The next blur or Enter parses again, or call `retry()`.
- Before submitting a form, `await field.settled()`: it resolves with the committed envelope once no parse is in flight, and rejects if the service failed. Enter still bubbles; whether to submit while pending is your call.

`quanto` and `react` (19+) are peer dependencies. The design is in the repository's `DESIGN.md`, "The input component".
