# Authoring quanto codecs

A codec turns text into a typed value (`parse`) and a value back into text (`format`). Built-in and custom codecs are written the same way, with `defineCodec`, and held to the same fixtures.

## The order of work

1. Write `fixtures.json` first. It is the codec's spec.
2. Write the codec with `defineCodec`.
3. Run `bun run check` (or your project's equivalent).

## File layout

```
src/codecs/<name>/
  index.ts        // the codec factory
  fixtures.json   // the spec; add fixtures.<variant>.json files as needed
```

## Defining a codec

```ts
import { defineCodec, readNumber, formatNumber, type CodecOptions } from 'quanto';

export const percent = (options?: CodecOptions<number>) =>
  defineCodec<number>({
    id: 'percent',
    parse(text, ctx) {
      const n = readNumber(text, ctx);
      if (!n || !/^\s*%?$/.test(text.slice(n.end))) {
        return { ok: false, issues: [{ code: 'unparseable', message: 'Expected a percentage, like "12.5%".' }] };
      }
      return { ok: true, value: n.value };
    },
    format: (value, ctx) => `${formatNumber(value, ctx, { maxFractionDigits: 2 })}%`,
    check: (value) => (typeof value === 'number' && Number.isFinite(value) ? [] : [{ message: 'Expected a finite number.' }]),
    options,
  });
```

You write:

- **`id`**: letters, digits, `_`, `-` and `.`.
- **`kind`** (optional): `'quantity' | 'money' | 'date' | 'time' | 'localDateTime' | 'dateTime'`. It lets `range()` complete partial sides. Omit it if none fits.
- **`parse(text, ctx)`**: return `{ ok: true, value }` or `{ ok: false, issues }`. Never throw on bad input. `text` is trimmed and never empty.
- **`format(value, ctx)`**: the default formatter.
- **`check(value)`**: the structural check. Return `{ message, path? }[]`, empty when `value` is a well-formed `T`. Servers validate stored values with it.
- **`options`**: pass the caller's `CodecOptions<T>` (`schema`, `format`) straight through. Codec-specific options extend `CodecOptions<T>`.

`defineCodec` handles the rest: empty input, running `check` and the user's `schema` (keeping its output), throwing from `format` on a malformed value, reporting the parse `context`, the `format` override and the composed `schema`. Don't reimplement any of it.

## Quantity codecs

For a number with a unit, don't write a parser: define a unit table and call `quantity()` (or extend a built-in table with an object spread).

```ts
import { quantity, lengthUnits } from 'quanto/codecs';

export const horseHeight = quantity({
  id: 'horseHeight',
  units: { ...lengthUnits, hand: { toBase: 0.1016, aliases: ['hh', 'hand', 'hands'] } },
  defaultUnit: 'hand',
});
```

- **`toBase` is a plain number whenever the conversion is a plain factor.** Only temperature-like scales need `{ factor, offset }`. Plain factors convert exactly and are the only units that compound (`5 ft 11 in`).
- **The first alias is what `format` prints.** Aliases match case-insensitively, except those that differ only by case from another unit's alias (`mW` and `MW`), which match exactly as written. Adding such a unit can change what existing input means: next to megabit `Mb`, typing `mb` no longer matches megabyte `MB` unless you list `mb` as an alias of `MB`.
- **`subunit`** makes a trailing bare number work: `ft: { …, subunit: 'in' }` reads `5'11` as 5 ft 11 in.

## Context and primitives

`ctx` is a `ResolvedCtx`:

- **`ctx.locale`**: bundled data for the locale: month and weekday names, numeric date order, separators, currency, measurement system.
- **`ctx.now()`**: the current time as an RFC 3339 string with offset. Always read the time through it, never `new Date()`: it honours a passed-in `now` and records it in the result's `context`.

Use the exported primitives rather than writing your own lexing:

- **`normalize(text)`**: smart quotes, primes, Unicode fractions, odd spaces. It doesn't fold case.
- **`readNumber(text, ctx, { from?, suffixes? })`**: reads one locale-aware number and returns `{ value, end }` or `undefined`.
- **`formatNumber(n, ctx, { maxFractionDigits? })`**: formats a number so `readNumber` reads it back.

Don't use `Intl` in `parse` or default `format`: its output varies between runtimes.

## Issue codes

| Code | When |
|---|---|
| `empty` | Produced by `defineCodec`; you never return it. |
| `unparseable` | The text can't be understood. |
| `missing_unit` | A bare number, and the codec has no default unit. |
| `unknown_unit` | A unit was written but isn't in the codec's table. |
| `missing_currency` | A bare number, and the codec has no default currency. |
| `unknown_currency` | A currency was written but isn't known. |
| `excess_precision` | More decimals than the value allows (`$3.459`). |
| `invalid` | Produced by `defineCodec` from the user's `schema`; you never return it. |

Messages are English. UIs localize by `code`.

## Rules

- **Format should round-trip.** `parse(format(v))` should succeed and differ from `v` by no more than the formatter's rounding. That's what makes formatted text safe to edit: the component shows it in the input and pickers set `raw` from it. A display-only formatter (prose, heavy rounding) is allowed, but say so in the codec's doc comment, skip `roundTrip` for it, and don't show its output as editable text.
- **Values are plain JSON data.** No classes, no `Date`, no `bigint`.
- **Deterministic.** The same text and context give the same value on every runtime.

## Fixtures

Fixtures are JSON and cover everything finicky: common inputs, locales, compound forms, every issue code the codec can return, alternatives, context and formatting.

```jsonc
[
  { "parse": "12.5%", "value": 12.5 },
  { "parse": "12,5 %", "ctx": { "locale": "de-DE" }, "value": 12.5 },
  { "parse": "twelve", "issues": ["unparseable"] },
  { "parse": "", "issues": ["empty"] },
  { "format": 12.5, "ctx": { "locale": "de-DE" }, "text": "12,5%" }
]
```

- **Parse:** `{ parse, ctx?, options?, value | issues, alternatives?, context? }`. `issues` lists codes in order. A missing `alternatives` means none are expected. `context` is checked only when given.
- **Format:** `{ format, ctx?, options?, text }`.
- `options` go to the codec factory.
- Anything time-dependent passes `ctx.now`. A fixture that reads the machine clock fails.

Wire them up with the helpers from `quanto/testing`, passing your framework's `test` function:

```ts
import { test } from 'vitest';
import { runFixtures, roundTrip } from 'quanto/testing';
import fixtures from './fixtures.json';
import { percent } from './index';

runFixtures(percent, fixtures, { test });
roundTrip(percent(), [0, 12.5, -3, 1_234_567.89], { test });
```

Don't write tests of plumbing (that the factory returns a codec, that options are wired). Fixtures and the typechecker cover what matters.
