# quanto — Design

Status: draft, pre-implementation. This document records decisions made so far and the questions still open.

## What this is

quanto is a library for turning messy human text into well-typed values, and back again, for any kind of value: lengths, weights, durations, money, dates, and custom types.

Think of it as a universal moment.js, generalized beyond dates, or as "what if Zod were unit-aware". `5'11"`, `180cm` and `1,8 m` all parse into the same typed value, which can be converted, compared and formatted.

The input component (`<QuantoInput />`) is one consumer of this core. It is not the core.

## Principles

1. **No inference at runtime.** Parsing is deterministic code. LLMs may write parsers at implementation or build time, never at runtime.
2. **Values are plain, immutable, JSON-safe data.** No class instances. The same value works on client and server without serializers.
3. **Operations are standalone functions.** Nothing is hung off a prototype or namespace object. Everything is a named export and tree-shakes.
4. **Context is explicit.** `locale`, `timeZone` and `now` are passed in. There is no global locale and no implicit "now".
5. **Don't rebuild what exists.** Validation is delegated to Standard Schema libraries (Zod, Valibot, ArkType…). Formatting leans on `Intl`. Date math, if ever shipped, is a separate package built on Temporal.
6. **One contract, two authors.** Built-in types and custom (often LLM-written) types use the exact same API and the same fixture requirements. Built-ins get no special hooks.
7. **Explicit over ergonomic.** Agents will write most custom types and unit tables, so APIs favor explicitness and good descriptions over brevity.

## Core concepts

### Type

A **type** is a codec between text and a typed value `T`:

```ts
interface QuantoType<T> {
  id: string;                                   // e.g. 'length'; used to tag merged results
  parse(text: string, ctx?: Ctx): ParseResult<T>;
  format(value: T, ctx?: Ctx): string;          // must round-trip: parse(format(v)) ≈ v
}

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: Issue[] };             // Standard Schema issue shape, plus a `code`

type Ctx = {
  locale?: string;    // BCP 47. Missing or ambiguous → assume en-US.
  timeZone?: string;  // IANA zone
  now?: string;       // ISO instant; required to parse relative input ("tomorrow")
};
```

Types are created by factory functions that take an options object. Option names shared across types:

| Option | Meaning |
|---|---|
| `schema` | A **synchronous** Standard Schema for `T`. `parse` runs it on the parsed value. This is the only validation mechanism. |
| `format` | `(value: T, ctx) => string`. Replaces the type's default formatter. Must produce text the type can parse back (dev-mode warning otherwise). |

Type-specific options (e.g. `defaultUnit`, `canonicalUnit`, `defaultCurrency`) are documented per type.

### Parse failure vs. validation

- **Parse failures** belong to quanto: text that can't be understood (`asdf`), or the wrong dimension (`70 kg` in a length field). The value doesn't exist yet, so there's nothing to validate.
- **Validation** belongs to the user's `schema`: `too tall`, `must be in the future`, etc.

Both are reported as Standard Schema–shaped issues, so a UI renders them the same way. quanto has no constraint API of its own: no `min`, no `max`, no chaining.

`schema` must be synchronous. An async schema is a configuration error, raised as early as can be detected.

### Merging types

```ts
const heightOrWeight = mergeTypes(length(), mass());
```

- Precedence is order: the first type whose `parse` succeeds wins. The order therefore also decides what bare input means (`70` → length if length is first and accepts bare numbers).
- The result is always tagged: `{ type: 'length', value: … } | { type: 'mass', value: … }`. `format` dispatches on the tag.
- Smarter negotiation (e.g. plausibility ranges) can be added later without changing this contract.

## Quantities

Length, mass, duration, temperature, volume, area and so on are all **quantities**: a number plus a unit, belonging to a **dimension**.

### Values

```ts
type Quantity<D extends Dimension> = { value: number; unit: UnitId<D> };
// e.g. { value: 71, unit: 'in' }
```

- A value keeps the unit the user typed, unless the type sets `canonicalUnit`.
- `value` is a JS number. Precision drift from conversion (`70.99999999`) is expected and is removed by rounding **in `format`**, never in stored values.
- Conversion factors are exact where they are defined exactly (1 in = 0.0254 m).

### Dimensions are explicit data

A dimension is a plain definition object. Built-in dimensions are defined with the same API that users and agents use:

```ts
export const lengthDimension = defineDimension({
  id: 'length',
  base: 'm',
  units: {
    m:  { toBase: 1,      aliases: ['m', 'meter', 'meters', 'metre', 'metres'] },
    cm: { toBase: 0.01,   aliases: ['cm', 'centimeter', 'centimeters'] },
    in: { toBase: 0.0254, aliases: ['in', 'inch', 'inches', '"', '″'] },
    ft: { toBase: 0.3048, aliases: ['ft', 'foot', 'feet', "'", '′'] },
    // …
  },
});

// Extending a dimension produces a new dimension. No global mutation.
export const horseLength = extendDimension(lengthDimension, {
  hand: { toBase: 0.1016, aliases: ['hh', 'hand', 'hands'] },
});

// A brand-new dimension.
export const dataSize = defineDimension({ id: 'dataSize', base: 'B', units: { /* B, KB, KiB, … */ } });
```

TypeScript types (unit IDs, `Quantity<D>`) are inferred from the definition object's literal type. There is no interface merging and no global registry.

- **Unit IDs** are the stored identifiers. They only need to be unique within a dimension, because every operation receives the dimension explicitly.
- **Aliases are resolved within the expected dimension.** `1m` is one meter to a length type and one minute to a duration type. Users never see unit IDs.
- **Affine dimensions** (temperature, which has an offset) declare `toBase` as `{ factor, offset }`. Adding or subtracting absolute temperatures is refused.

### Operations

Operations take the dimension as their first argument, so dimension checking is explicit at both type level and runtime:

```ts
convert(lengthDimension, h, 'cm');   // Quantity<length> in cm
add(lengthDimension, a, b);          // result in a's unit
subtract(lengthDimension, a, b);
scale(lengthDimension, a, 2);
compare(lengthDimension, a, b);      // -1 | 0 | 1
```

- A value whose unit isn't in the given dimension is a type error, and throws at runtime (covering untyped JSON).
- Any two values of the same dimension can be combined. `height` is a *type* (parsing plus options); the values it produces are just lengths. The results of operations are not re-validated against any type's schema.
- Out of scope: dimensional algebra (length ÷ time = speed, compound SI units).

### Quantity types

```ts
const height = length({
  defaultUnit: 'in',   // what a bare "70" means. Default: derived from ctx.locale (US → 'in').
  canonicalUnit: 'in', // optional: always convert the parsed value to this unit
  schema: z.object({ value: z.number().min(24).max(96), unit: z.literal('in') }),
  format: feetInches,  // optional
});
```

- **`canonicalUnit`** narrows the value type to that unit (`Quantity<length, 'in'>`) and turns unit-aware constraints into plain number checks that any validator can express. It is the recommended way to validate quantities.
- Without `canonicalUnit`, cross-unit constraints are written as refinements that use quanto's math, e.g. `.refine((h) => compare(lengthDimension, h, { value: 8, unit: 'ft' }) <= 0)`.
- Compound input (`5'11"`, `5 ft 11 in`, `1 lb 4 oz`, `2h30m`) is summed into the largest unit mentioned, or into `canonicalUnit` if set. *(Open: largest vs. smallest unit.)*
- Built-in quantity types: `length`, `mass`, `duration`, `temperature`, `volume`, `area`, `speed` (as its own dimension with its own units, not derived).
- `duration` covers fixed-length units only (ms through weeks). Calendar durations (months, years) are not quantities because they have no fixed length.

## Money

Money is **not** a quantity. Converting currencies has no fixed factor: it needs exchange rates, which are external data that change over time.

### Values

```ts
type Money = { minorUnits: number; currency: string }; // ISO 4217 code
// $12.34 → { minorUnits: 1234, currency: 'USD' }
// ¥500   → { minorUnits: 500,  currency: 'JPY' }  (JPY has 0 decimal places)
// BHD 1.234 → { minorUnits: 1234, currency: 'BHD' } (BHD has 3)
```

- Amounts are **integers in the currency's minor unit**, never floats. Floats can't represent most decimal fractions (`0.1 + 0.2 !== 0.3`). Unlike measurement drift, money errors survive summing, comparison and storage, so "round in format" isn't enough.
- The number of decimal places comes from the currency, via ISO 4217 data (available through `Intl.NumberFormat(...).resolvedOptions()`).
- A JS number holds integers exactly up to 2^53 (~$90 trillion in cents), which is enough. `bigint` is not JSON-safe and is avoided.
- The field name `minorUnits` is deliberately explicit, so nobody mistakes 1234 for $1234.

### Operations

- `add`, `subtract` and `compare` require the same currency. Mismatches are a type error where currency literals are known, and a runtime error otherwise.
- `scale(m, factor, { rounding })` requires an explicit rounding mode, since the result may not land on a whole minor unit.
- `allocate(m, ratios)` splits without losing a cent (e.g. $10 three ways → 334 / 333 / 333).
- `convert(m, 'EUR', { rate })` requires the caller to pass the rate. quanto never fetches rates.

### Parsing

- Accepts `$12`, `12 USD`, `€12,50`, `12.50 eur`, `$1.2k`, `$3M`.
- Ambiguous symbols (`$` is used by USD, CAD, AUD, MXN…) resolve to the type's `defaultCurrency` option, then to `ctx.locale`'s currency, then to USD.
- Input with more precision than the currency allows (`$3.459`) is a parse issue. Sub-minor-unit prices (fuel, unit pricing, crypto) are an open question.

## Dates and times

Values are **ISO 8601 strings**. They're JSON-native, sortable, and parse losslessly into Temporal if an app needs date math. quanto does no date math. A future separate package may provide it, built on Temporal.

| Type | Value | Example |
|---|---|---|
| `date()` | calendar date | `'2026-10-02'` |
| `time()` | wall-clock time | `'15:00'` / `'15:00:30'` |
| `localDateTime()` | date and time, no zone | `'2026-10-02T15:00'` |
| `dateTime()` | exact moment in a zone | `'2026-10-02T15:00:00-04:00[America/New_York]'` |

- Relative input (`tomorrow`, `next fri`, `in 3 days`) requires `ctx.now`. Without it, parsing returns a `missing_context` issue instead of silently using the current time. `dateTime()` also uses `ctx.timeZone`.
- Because the parsed value is captured at entry time and stored, relative input is never re-parsed later (see the stored envelope below).
- Numeric dates follow the locale. `03/04/2026` is March 4 in en-US (the default) and 3 April in en-GB. Unambiguous forms (`2026-03-04`, `4 Mar`, `13/04`) are accepted in any locale.

## Locale-aware number parsing

`ctx.locale` drives parsing, not just formatting. When it's missing, assume en-US. Always make a best effort:

- Both separators present: the last one is the decimal separator. `1.234,5` → 1234.5; `1,234.5` → 1234.5.
- A single separator followed by **exactly three digits** is ambiguous (`1,500`, `1.500`). The locale decides; en-US reads `1,500` as 1500 and `1.500` as 1.5.
- A single separator followed by **one, two, or four or more digits** is a decimal separator in any locale: `1,5 m` → 1.5 m, `2,25` → 2.25.
- Thousands grouping must be consistent (`1,50,000` is valid in en-IN, not in en-US).
- Other accepted forms: fractions (`1/2`, `5½`), exponents (`1e3`), suffixes (`1.2k`, `3M`) where the type allows them.
- Input is normalized before lexing: smart quotes (`’ ”` → `' "`), prime marks (`′ ″`), Unicode fractions, non-breaking and thin spaces.

Default formatters use `Intl.NumberFormat` (including `style: 'unit'` and `style: 'currency'`) with `ctx.locale`.

## Ranges

A range is a **wrapper around any type**:

```ts
const heightRange = range(length({ defaultUnit: 'ft' }));
heightRange.parse('5-7 ft'); // { ok: true, value: { start: { value: 5, unit: 'ft' }, end: { value: 7, unit: 'ft' } } }
```

- The value is `{ start: T; end: T }` using the inner type's values. There is one `raw` for the whole field, not one per endpoint.
- Separators: `-`, `–`, `—`, `to`, `until`, `through`. Hyphens also appear inside values (negative numbers, ISO dates `2026-10-03`), so the wrapper tries each candidate split and keeps the ones where both sides parse.
- **Shared context between endpoints**: in `5-7 ft`, `Oct 3-5` and `9-5pm`, information on one side applies to the other. The inner type's `parse` gets an optional `ctx.counterpart` (the other endpoint's parsed value) and may use it to fill in what's missing. Types that don't implement this still work for fully specified ranges.
- Ordering (`start <= end`) needs a comparison, so types may optionally expose `compare(a, b)`. Without it, ordering is left to the user's schema.
- Open-ended ranges (`5ft+`, `under 10 kg`) are deferred.

## The stored envelope

Wherever a value is entered by a person, store both the text and the parsed value:

```ts
type QuantoValue<T> = {
  raw: string;       // exactly what was typed, or format(value) if set by a picker or default
  value?: T;         // parsed at entry time; the source of truth
  issues?: Issue[];  // present when raw doesn't parse or fails validation
};
```

- `value` is authoritative. `raw` is kept for audit, display and re-editing.
- Servers validate `value` with the same Standard Schema. They never need to re-parse `raw`, which would give different results for relative input.
- A restored `raw` is never re-parsed unless the user edits it.

## The input component

`<QuantoInput />` is a thin UI over a type's `parse` and `format`.

```tsx
import { QuantoInput } from 'quanto/react';
import { length } from 'quanto/types';
import { feetInches } from 'quanto/formats';

<QuantoInput
  type={length({ defaultUnit: 'in', format: feetInches })}
  defaultValue={{ value: 70, unit: 'in' }}  // raw = format(value)
  defaultRaw={`5'10"`}                       // with defaultValue: restore exactly, no re-parse
  onChange={(v: QuantoValue<T>) => {}}      // fires on commit: blur, Enter, picker selection
  display="formatted-on-blur"               // | 'raw' | 'formatted'
/>
```

- **Uncontrolled by default**, since it owns the envelope internally. An optional controlled `value: QuantoValue<T>` is available.
- **No `type`** means plain text: `raw` only, and no types are bundled. "Accept anything" is an explicit opt-in: `import { auto } from 'quanto/types'`, a merged type of all built-ins plus a text fallback.
- **Live echo**: the component may parse on every keystroke to show its interpretation (`5 ft 11 in · 180 cm`), but only emits `onChange` on commit.
- **Raw display** always shows the interpretation next to the text, so stale relative input (`tomorrow`) is never misleading.
- **Accessories**: a type may provide an `input` accessory (e.g. a calendar icon that opens the OS picker). It receives `{ value, onChange, focused }`, and selecting a value sets `raw = format(value)`. Text entry always stays available.
- **Keyboard hint**: types may declare a mobile keyboard type. Height needs one that can type `'` and `"`, which a numeric keypad can't.
- **Form libraries** are not a design driver. quanto exposes `value` / `onChange` / `onBlur` / `ref`, which is enough for React Hook Form's `Controller` and TanStack Form.
- **Platforms**: the core is pure TypeScript with no runtime dependencies. Web is first. React Native is a separate adapter over the same core.

## Packaging

- ESM only, with `"sideEffects": false`.
- Subpath exports:
  - `quanto`: core (`defineDimension`, `extendDimension`, `mergeTypes`, `range`, quantity and money operations)
  - `quanto/types`: built-in types
  - `quanto/formats`: ready-made formatters
  - `quanto/react`: web component
- Nothing is attached to the component or a namespace object.

## Authoring types: fixtures are the spec

Every type, built-in or custom, ships a fixture table, and CI enforces it:

```ts
export const fixtures: Fixture<Quantity<typeof lengthDimension>>[] = [
  { input: `5'11"`,  ctx: { locale: 'en-US' }, expect: { value: 71, unit: 'in' } },
  { input: '1,8 m',  ctx: { locale: 'de-DE' }, expect: { value: 1.8, unit: 'm' } },
  { input: '70 kg',                            expectIssue: 'wrong_dimension' },
];
```

- An LLM adding a type writes the fixtures **first**, then the parser.
- Required property test for every type: `parse(format(v))` round-trips across a generated set of values.
- Built-ins follow the same rules. They have no private escape hatches.

*(Open: the exact fixture format, and an authoring guide written for agents.)*

## Non-goals

- Inference or ML of any kind at runtime.
- A validation or constraint API (delegated to Standard Schema).
- Object or array schema composition (that's what Zod, Valibot and ArkType are for).
- Date math (possible future separate package, built on Temporal).
- Dimensional algebra.
- Fetching exchange rates or any other external data.

## Open questions

1. **Naming.** "Type" vs. "scheme" for the core abstraction; `mergeTypes` vs. `mergeSchemes`; the input component name (`QuantoInput` is a placeholder).
2. **Standard Schema on types.** Should a `QuantoType` itself implement Standard Schema (validating a structured `T`, delegating to `schema`) so it can be passed straight to form libraries?
3. **Compound quantity result unit.** Does `5'11"` become `71 in` (smallest unit) or `5.9167 ft` (largest unit)? Smallest unit is probably more intuitive.
4. **Mid-typing states.** Should `ParseResult` include an `incomplete` status (`5'`) so the UI doesn't flash an error while someone is typing?
5. **Sub-minor-unit money** (e.g. `$3.459`): an optional precision override on the money type, or out of scope?
6. **Custom types and tags.** `mergeTypes` tags by `id`. How are `id` collisions handled when two custom types share a name?
7. **Calendar durations** (`2 months`): a separate non-quantity type with an ISO 8601 duration value (`P2M`), or out of scope?
8. **React Native adapter**: when, and how accessories are split between platforms.
