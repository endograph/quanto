# @quantojs/react

A React input for [quanto](https://github.com/endograph/quanto#readme). People type `5'11`, `180cm` or `1,8 m`; the field shows its interpretation as they type, parses on blur or Enter, and gives you `{ raw, value }` to store.

```tsx
import { QuantoInput, QuantoProvider } from '@quantojs/react';
import { length } from '@quantojs/common';

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
- Build your own field with `useQuanto(codec, options)`, which returns `inputProps` for any `<input>`, plus `echo` (and `showEcho`, whether it's worth displaying), `issues`, `value`, `pick`, `alternatives`, `choose` and `commit`.
- Text that reads several ways (`1m` under `merge([length(), duration()])`, or a codec's `ambiguous` failure) comes with `alternatives`. Offer them, and call `choose(value)` with the one picked: it becomes the value and `raw` stays what was typed. `pick(value)` is for pickers: the text becomes the formatted value. Most apps with their own markup or a form library build on the hook; `QuantoInput` is the minimal default.

## External codecs

For a codec built with `defineExternalCodec` (its parse calls a model or a server), pass it to the same `QuantoInput`, or build on `useExternalQuanto`. It takes the same options, and parses on commit only: there's no echo while typing.

```tsx
<QuantoInput codec={recipeYield({ service })} onChange={(entry) => save(entry)} />
```

- While a parse is in flight, `pending` is true, the input has `aria-busy`, and the wrapper has `[data-quanto-pending]`. Editing aborts it.
- If the service fails, nothing commits and the text stays: `failed` and `error` are set, the wrapper has `[data-quanto-failed]`, and the alert region shows `failedMessage`. The next blur or Enter parses again, or call `retry()`.
- Before submitting a form, `await field.settled()`: it resolves with the committed envelope once no parse is in flight, and rejects if the service failed. Enter still bubbles; whether to submit while pending is your call.
- An ambiguous parse's `alternatives` come back after the commit; `choose(value)` takes one, keeping `raw`.

### Completions

If the codec has `complete` (an address service, say), `useExternalQuanto(codec, { completions: true })` asks for completions while typing, debounced (`completionDelay`, default 150 ms), and returns `completions` for you to render. @quantojs/react ships no list UI: the markup, look and positioning are yours.

```tsx
const field = useExternalQuanto(address, { onChange: save, completions: true });

<input {...field.inputProps} />
{field.completions?.open && (
  <ul {...field.completions.listProps}>
    {field.completions.items.map((item) => (
      <li key={item.key} {...field.completions.itemProps(item)}>{item.label}</li>
    ))}
  </ul>
)}
```

- With completions on, `inputProps` add the combobox attributes (`role`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete`) and the keys: arrows move the highlight, Enter picks the highlighted item (and doesn't submit), Escape closes the list.
- `listProps` and `itemProps` keep focus in the input, so choosing with the pointer isn't a blur that starts a parse.
- A completion is never applied unless chosen: committing parses the text as typed. An ambiguous parse puts its candidates in the list.
- Choosing a completion that needs a fetch sets `completions.resolving` until its value arrives; `settled()` waits for it, and if the fetch fails, `failed` is set and `retry()` or Enter fetches again. A blur doesn't re-parse the committed text.
- Each request gets `ctx.session`, a token that's the same from the first edit to the committed value, for services that bill a session (Google's session tokens).
- Items are the last commit's alternatives (`kind: 'alternative'`, chosen keeping `raw`), then the completions (`kind: 'completion'`, picked).

`quanto` and `react` (19+) are peer dependencies. The design is in the repository's `DESIGN.md`, "The input component".
