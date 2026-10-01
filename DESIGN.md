# quanto — Design

Status: draft, pre-implementation. This document records decisions made so far and the questions still open.

## What this is

quanto is a library for turning messy human text into well-typed values, and back again, for any kind of value: lengths, weights, durations, money, dates, and custom types.

Think of it as a universal moment.js, generalized beyond dates, or as "what if Zod were unit-aware". `5'11"`, `180cm` and `1,8 m` all parse into the same typed value, which can be converted, compared and formatted.

It ships as a small core (`quanto`: the codec contract, primitives, quantities and the wrappers) plus `quanto-datetime`, a separate package built on its public API (see [Packaging](#packaging)). First-party codecs whose behaviour is complete and settled are in the core, including money (`quanto/money`); a domain that's intentionally incomplete or still evolving, like dates, gets its own package, which owns its codecs and range rules and versions on its own.

The input component (`<QuantoInput />`) is one consumer of this core, shipped as a separate package. It is not the core, and nothing UI-specific lives in the core.

## Principles

1. **Values are plain, immutable, JSON-safe data.** No class instances. The same value works on client and server without serializers.
2. **Operations are standalone functions.** Nothing is hung off a prototype or namespace object. Everything is a named export and tree-shakes. There are no overloads. Subpaths and packages act as namespaces, so `quanto/quantity` and `quanto/money` can both export `convert`; import with an alias when a file needs both.
3. **Context is explicit when you want it, inferred when you don't.** `locale` and `now` can be passed in. When `now` is missing, parsing uses the machine's clock and local offset, because that is what the person typing means. Every successful parse reports the `context` it was based on (see [Parse context](#parse-context)), so apps that want replayability can keep it. There is no global, mutable context.
4. **Don't rebuild what exists.** Validation is delegated to Standard Schema libraries (Zod, Valibot, ArkType…). Opt-in rich formatters lean on `Intl`. Date math, if ever shipped, is a separate package built on Temporal.
5. **One contract, two authors.** Built-in codecs and custom (often LLM-written) codecs use the exact same API and the same fixture requirements. Every built-in codec is defined with `defineCodec` and the exported primitives. Built-ins get no special hooks.
6. **Explicit over ergonomic.** Agents will write most custom codecs and unit tables, so APIs favor explicitness and good descriptions over brevity.
7. **Common case only, in the built-ins.** Built-in codecs implement common-sense behaviour with no knobs for edge cases. Anyone who needs different behaviour writes a custom codec, which has full control over parsing, formatting and units.
8. **Stable once stored.** User ergonomics come first at parse time: parsing may infer from the machine (clock, local offset). Stability is required of what's stored: once `raw` and `value` exist they are the source of truth and are never re-parsed behind the user's back. Given the same text and the same context, parsing gives the same value on every runtime, because the data it needs (currency minor units, month names, separators) is bundled rather than read from `Intl`. Default formatting uses the same bundled data; `Intl` is used only by opt-in formatters in `quanto/formats`.
9. **Start small.** Ship the minimum contract and build iteratively. Deferred items are listed at the end.

## Core concepts

### Codec

A **codec** is the pair of a parser and a formatter for a value `T`. (The word "type" is avoided because it collides with TypeScript's keyword in prose, props and generics.)

```ts
interface Codec<T> {
  id: string;                                   // e.g. 'length'; used to tag merged results
  parse(text: string, ctx?: Ctx): ParseResult<T>;
  format(value: T, ctx?: Ctx): string;
  schema: StandardSchemaV1<T>;                  // validates a structured T (see below)
}

type ParseResult<T> =
  | { ok: true; value: T; context: ParseContext; alternatives?: T[] }  // alternatives: set only by merge()
  | { ok: false; issues: Issue[] };

type Ctx = {
  locale?: string;  // BCP 47. Missing → en-US. See Locales.
  now?: string;     // RFC 3339 timestamp with a UTC offset. Missing → the machine's clock and local offset.
};

// The context a parse was based on, whether passed in or inferred.
// Passing it back as ctx reproduces the value.
type ParseContext = {
  locale: string;   // always present: the canonicalized ctx.locale, or 'en-US'
  now?: string;     // present only if the parse read the clock
};
// e.g. parse('tomorrow') without ctx → context: { locale: 'en-US', now: '2026-09-30T14:02:11-04:00' }
```

- **`parse` never throws** on bad input. Every failure is a `ParseResult` with issues. Programmer errors throw, with a message that says what is wrong and what to do about it. Almost all are raised by factory functions at definition time (unknown unit, alias collisions, a malformed `id`…). Two can only surface when parse runs: an async `schema` (see below), and a custom codec whose `parse` returns a value its own `check` rejects.
- **`format` throws on a malformed value**, one that fails the codec's structural check (a unit not in the table, a non-finite number, a malformed date string). That is a programmer error, like an operation given a mismatched currency. `format` doesn't run the user's `schema`, so a stored value that a later, stricter schema rejects still displays.
- **`formatWithFallback(codec, value, fallback, ctx?)`** is for displaying data that may be malformed (legacy rows, a unit since removed from the table). It returns `fallback` where `format` would throw on a malformed value. Any other error, such as a bug in a formatter, still throws, so the fallback never hides bugs. `value` is typed `unknown`, since the point is untrusted data.
- **`parse` and `format` are synchronous** in v1. Async codecs are planned for v2 as a separate, additive interface (see [Async codecs (v2)](#async-codecs-v2)); the sync `Codec` interface will not change.
- **Round-trip.** A formatter round-trips when `parse(format(v))` succeeds and differs from `v` by no more than the formatter's rounding. Formatting is the only place precision is lost.
  - **Built-in default formatters must round-trip.** That matters wherever formatted text becomes editable `raw`: a picker or `defaultValue` sets `raw = format(value)`, and formatted display shows text the user then edits. A formatter that doesn't round-trip turns one keystroke and a blur into a silently changed value (`1.83 m` shown as `2 m`, re-parsed as 2 m).
  - **Custom formatters should round-trip**, whether a custom codec's default or a `format` option. Display-only formatters (prose, heavy rounding) are allowed. A field using one must not show formatted text as editable (use `display="raw"` in the component) and must not set `raw` from it.
- **`schema`** is a composed Standard Schema over `T`: quanto's own structural check (the unit is in the codec's table, the currency is known, the string is a valid date…) followed by the user-supplied `schema` option, if any. Servers validate stored values with it and never need to re-parse. The codec itself is deliberately not a Standard Schema, because "validate a string" and "validate a structured value" are different operations.

Codecs are created by factory functions that take an options object. Option names shared across codecs:

| Option | Meaning |
|---|---|
| `schema` | A **synchronous** Standard Schema from `T` to `T` (`StandardSchemaV1<T, T>`). `parse` runs it on the parsed value and keeps its output, so it can normalize as well as validate (round, clamp to a canonical form). Transforms must be idempotent, because the schema runs again on values that already went through it: a server validating a stored value, or re-parsing formatted text. This is the only validation mechanism. |
| `format` | `(value: T, ctx: ResolvedCtx) => string`. Replaces the codec's default formatter. Should round-trip (see above). |

These two make up `CodecOptions<T>`. Codec-specific options (e.g. `defaultUnit`, `canonicalUnit`, `defaultCurrency`) extend it and are documented per codec.

### Defining a codec

`defineCodec` is how every codec is built, built-in or custom. The author supplies the parts specific to the value; `defineCodec` supplies everything every codec must do the same way.

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

The author supplies:

| Field | Meaning |
|---|---|
| `id` | Letters, digits, `_`, `-` and `.`. Parentheses and commas are reserved for derived ids (see [Merging codecs](#merging-codecs)). |
| `parse(text, ctx)` | Returns `ParseOutcome<T>`: `{ ok: true; value } \| { ok: false; issues }`. No `context`, no `alternatives`. |
| `format(value, ctx)` | The default formatter. |
| `check(value: unknown)` | The structural check: returns `{ message, path? }[]`, empty when `value` is a well-formed `T`. |
| `options?` | The caller's `CodecOptions<T>`, passed through. |

`defineCodec` then:

- Returns an `empty` issue for empty or whitespace-only input, without calling the author's `parse`. The author's `parse` receives the text trimmed, but otherwise untouched: call `normalize` if the codec wants it.
- Resolves `ctx` into a `ResolvedCtx` (below) and passes it to `parse` and `format`.
- Runs `check` on the parsed value. A failure is a bug in the codec, so it throws.
- Runs `options.schema` and keeps its output as the value. Its issues are wrapped with `code: 'invalid'`; a Promise throws.
- Attaches `context` to a successful result.
- Uses `options.format` in place of the author's `format` when given.
- Runs `check` before formatting, and throws quanto's invalid-value error when it fails. That is the error `formatWithFallback` catches.
- Builds `schema`: `check`, then `options.schema`, as one Standard Schema.

```ts
interface ResolvedCtx {
  locale: Locale;  // the resolved bundled data for ctx.locale; see Locales
  now(): string;   // ctx.now, or the machine's clock and local offset.
                   // Calling it records `now` in the result's context.
}
```

Reading the clock through `ctx.now()` is what keeps `context` accurate without any bookkeeping in the codec.

### Primitives

The lexing built-ins use is exported from `quanto`, so custom codecs get the same locale behaviour and the same determinism:

- **`normalize(text)`**: the input normalization described under [Locale-aware number parsing](#locale-aware-number-parsing): quotes and primes, Unicode fractions (`5½` → `5 1/2`), NFKC (so full-width digits read as digits), the Unicode minus sign, and runs of any whitespace to one space. It doesn't fold case or trim.
- **`readNumber(text, ctx, { from?, suffixes? })`**: reads one number starting at `from` (default 0, leading spaces skipped) using the locale rules, and returns `{ value, end }` or `undefined`. It accepts a leading `-` or `+`; whether negatives make sense is the codec's call. `suffixes: true` accepts `k`, `m`, `b`/`bn` and `t`, attached to the number and case-insensitive. When the locale's reading of an ambiguous separator gives invalid grouping, the other reading is used (`1234,567` in en-US is 1234.567).
- **`formatNumber(n, ctx, { maxFractionDigits?, minFractionDigits? })`**: formats with the region's bundled separators and grouping, so the result reads back with `readNumber`. Defaults: at most 3 fraction digits, at least 0; rounding is half away from zero, on the number's shortest decimal representation (`1.005` → `1.01` at two digits). Space and apostrophe grouping print as plain ` ` and `'`.
- **`ctx.locale`**: the resolved language and region, the number separators and grouping, and the measurement system, for codecs that need them directly.
- **`lookupRegional(locale, regions, exceptions?)`**: looks up a codec's own region-keyed data (the `language-region` row if there is one, otherwise the region's), so every codec resolves a locale the same way. `quanto/money` uses it for currencies, `quanto-datetime` for date orders and clocks, and custom codecs for their own tables.

The built-in date grammar is not exported in v1.

### Parse context

A successful parse reports the `context` it was based on: the locale (always) and `now` (when the parse read the clock), whether they were passed in or inferred. `merge` reports the union over the codecs it ran.

It is deliberately **not** part of the stored envelope. `value` is authoritative, so reading a stored value never needs it. Context is only needed to **replay** a parse: auditing, debugging a surprising value, or migrating stored values after a parser fix. That is rare, so apps opt in by keeping it wherever suits them:

```ts
const result = height.parse(raw, ctx);
if (result.ok) {
  save({ raw, value: result.value });        // the envelope
  audit.record(fieldId, result.context);     // optional, stored separately
}

// later: replay
height.parse(raw, storedContext);            // the same value, on the same package versions
```

- `ParseContext` is assignable to `Ctx`, so replay needs no merging.
- Replay is exact on the same versions of `quanto` and of the package that owns the codec: a date's result depends on `quanto-datetime` as well as the core. A later version of either can differ where its parser or bundled data changed, which is exactly what a migration wants to detect. `context` doesn't record versions; apps that need exact replay keep their dependency versions alongside (a lockfile in their history is usually enough).

### Issues

Every issue quanto produces has the Standard Schema issue shape plus a `code` from a closed union:

```ts
type IssueCode =
  | 'empty'             // input is empty or whitespace only
  | 'unparseable'       // text could not be understood at all
  | 'missing_unit'      // bare number and the codec has no defaultUnit
  | 'unknown_unit'      // a unit was written but isn't in the codec's unit table ("70 kg" in a length field)
  | 'missing_currency'  // bare number and the codec has no defaultCurrency
  | 'unknown_currency'  // a currency was written but isn't known ("12 XYZ", "12 bananas")
  | 'excess_precision'  // "$3.459" for a two-decimal currency
  | 'invalid';          // the user's schema rejected the value (or, server-side, the codec's structural check did)

type Issue = {
  code: IssueCode;
  message: string;
  path?: PropertyKey[];
  codec?: string;  // set by merge(): the id of the codec that reported it
};
```

- Issues from the user's `schema` are passed through unchanged, wrapped with `code: 'invalid'`. Their `path` is relative to `T`.
- `message` is English. UIs that need localization map on `code`.
- The union is exported so fixtures and consumers can reference codes by type, not by string.

### Parse failure vs. validation

- **Parse failures** belong to quanto: text that can't be understood, or a unit the codec doesn't know. The value doesn't exist yet, so there's nothing to validate.
- **Validation** belongs to the user's `schema`: `too tall`, `must be in the future`, etc.

Both are reported as Standard Schema–shaped issues, so a UI renders them the same way. quanto has no constraint API of its own: no `min`, no `max`, no chaining.

`schema` must be synchronous in v1. Standard Schema has no async flag, so an async schema can't be detected at definition time: if its `validate()` returns a Promise, `parse` throws, saying that async schemas arrive with async codecs in v2.

### Empty input and optional fields

`parse('')` (and whitespace-only input) returns an `empty` issue. Required-ness is therefore the default. To allow empty:

```ts
const maybeHeight = optional(length({ defaultUnit: 'in' }));
maybeHeight.parse('');   // { ok: true, value: null }
```

`optional` is a wrapper, like `range`. It keeps the inner codec's `id`. Its value type is `T | null` and its `schema` accepts `null`.

### Merging codecs

```ts
const heightOrWeight = merge([length(), mass()]);
```

- Takes an array of codecs. Earlier codecs win: the first whose `parse` succeeds provides the value. The order therefore also decides what bare input means.
- The result is tagged by `id`: `{ codec: 'length', value: … } | { codec: 'mass', value: … }`. `format` dispatches on the tag.
- **Alternatives are reported.** A successful `ParseResult` also carries `alternatives`: the tagged values from every later codec that also parsed, in codec order. `1m` under `merge([length(), duration()])` returns length as `value` and duration in `alternatives`, so a UI can offer a chooser instead of guessing silently. Alternatives are a parse-time hint, not part of the value, and are never stored. Choosing one replaces `value` and keeps `raw`.
- **Failures report everything.** If every codec fails, the result carries all of their issues, in codec order, each with `codec` set to the id that reported it.
- Two codecs with the same `id` are a definition-time error.
- **Its `id` is derived**, so it is deterministic: `merge(length,mass)`, from the inner ids in order. Nested merges flatten: `merge([merge([a, b]), c])` is the same codec as `merge([a, b, c])`, and tags are always leaf ids. Custom ids can't contain parentheses or commas, so derived ids never collide with them.
- **Empty input** is one `empty` issue, not one per codec.
- **`context`** combines the contexts of the codecs that parsed: the locale, and `now` if any of them read the clock.
- **One clock per parse.** Without `ctx.now`, the first member to read the machine clock pins that reading: later members get it as `ctx.now`, so they all agree. `defineRange` does the same across both sides and every completion, so `today-tomorrow` can't straddle midnight.
- **Types:** the value is `Tagged<T> = { codec: string; value: T }`, where `T` is the union of the leaf codecs' value types. Codec ids are plain strings at the type level, so narrowing on `codec` doesn't narrow `value`; check the value's shape or cast after checking the tag. The merged codec exposes its leaf codecs as `codecs`.
- Merge is expected to be uncommon. Custom codecs are the primary extension mechanism.

## Quantities

Length, mass, duration, temperature, volume, area and so on are all **quantities**: a number plus a unit from the codec's **unit table**.

### Values

```ts
type Quantity<U extends string = string> = { value: number; unit: U };
// e.g. { value: 71, unit: 'in' }
```

- A value keeps the unit the user typed, unless the codec sets `canonicalUnit`.
- `value` is a JS number. Precision drift from conversion (`70.99999999`) is expected and is removed by rounding **in `format`**, never in stored values.
- Conversion factors are exact where they are defined exactly (1 in = 0.0254 m).

### Unit tables

A quantity codec is built from a unit table: a plain object mapping unit IDs to a conversion factor and aliases. There is no separate "dimension" concept; the codec carries its table. Built-in codecs are defined with the same `quantity()` factory that users and agents use:

```ts
export const lengthUnits = {
  m:  { toBase: 1,      aliases: ['m', 'meter', 'meters', 'metre', 'metres'] },
  cm: { toBase: 0.01,   aliases: ['cm', 'centimeter', 'centimeters'] },
  in: { toBase: 0.0254, aliases: ['in', 'inch', 'inches', '"', '″'] },
  ft: { toBase: 0.3048, aliases: ['ft', 'foot', 'feet', "'", '′'] },
  // …
} satisfies UnitTable;

export const length = (options?: QuantityOptions<keyof typeof lengthUnits>) =>
  quantity({ id: 'length', units: lengthUnits, ...options });

// Adding units is a plain object spread. No global mutation.
const horseHeight = quantity({
  id: 'horseHeight',
  units: { ...lengthUnits, hand: { toBase: 0.1016, aliases: ['hh', 'hand', 'hands'] } },
  defaultUnit: 'hand',
});

// A brand-new kind of quantity.
const dataSize = quantity({ id: 'dataSize', units: { /* B, KB, KiB, … */ } });
```

TypeScript types (unit IDs, `Quantity<U>`) are inferred from the table's literal type. There is no interface merging and no global registry.

- **Unit IDs** are the stored identifiers. They only need to be unique within a table, and are kept compact (`mW` and `MW`, `Mbps` and `MBps`), even where two differ only by case.
- **Aliases are resolved within the codec's own table.** `1m` is one meter to a length codec and one minute to a duration codec. A unit from some other table (`70 kg` in a length field) is simply an `unknown_unit`. Users never see unit IDs.
- **Alias matching is case-insensitive**, after Unicode normalization: `3M` and `3m` are both meters. The one exception is worked out from the table, with nothing to configure: when aliases of different units differ only by case, like `mW` (milliwatt) and `MW` (megawatt), or `Mb` (megabit) and `MB` (megabyte), each of them matches only exactly as written. Input that matches none of them exactly, like `mw` in that table, is an `unknown_unit` rather than a guess. Where one reading is the common case, the table lists that spelling as an alias too: `MB: { aliases: ['MB', 'mb', …] }` makes `mb` read as megabytes while `Mb` stays megabits. The same alias on two units is a definition-time error.
- **Linear, affine and function units.** `toBase` says how a unit converts to the table's base unit, and its form declares what kind of unit it is; nothing is inferred:
  - a **number** is a linear factor (`in: { toBase: 0.0254 }`). Converting between two units is value × `from.toBase` ÷ `to.toBase`, with decimal factors scaled to integers first so results are exact. Use this form whenever the conversion is a plain factor.
  - **`{ factor, offset }`** is affine (temperature): base = value × factor + offset. With kelvin as the base, °C is `{ factor: 1, offset: 273.15 }`.
  - a **function**, with a sibling **`fromBase`** function, is for conversions that aren't "multiply, then maybe add": fuel economy (`'l/100km': { toBase: (v) => 100 / v, fromBase: (v) => 100 / v, … }` with km/L as the base) or wire gauge.
    - Having one of the pair without the other is a definition-time error, and so is a failed spot check. At fixed sample points (`0.5, 1, 2, 10, 100`, skipping any where `toBase` isn't finite), `fromBase(toBase(x))` must come back to `x` within tolerance, and `toBase` must be strictly increasing or strictly decreasing. The check catches a missing, swapped or wrong inverse; the `roundTrip` fixtures stay the real safety net.
    - The functions must be strictly monotonic, or they can't invert each other and `compare` has no meaning. Tables should pick a base where bigger means more: km/L, not L/100km, for fuel economy.
    - A value with no base value (`0 L/100km`), or none in `canonicalUnit` (`0 mpg` when the canonical unit is L/100km), is `unparseable`: the input means nothing. Merely out-of-range values (`-5 mpg`) are left to the user's schema, as for every quantity. `convert` throws on a non-finite result.
- **Only linear units compound** (`5 ft 11 in`) or serve as a `subunit`. Affine and function units convert and compare only.
- **`subunit`** (optional) names the unit a trailing bare number takes after this one: `ft: { …, subunit: 'in' }` makes `5'11` read as 5 ft 11 in, and `m: { …, subunit: 'cm' }` makes `1m80` read as 180 cm. It's explicit rather than guessed from the table, and must name a smaller linear unit.
- `quantity()` checks at definition time that no alias belongs to two units (see the case rule above), that subunits and function units are well formed, and that `defaultUnit` and `canonicalUnit` name real units.

### Operations (`quanto/quantity`)

Operations are opt-in, live in their own subpath, and are a convenience rather than the core. There are two, `convert` and `compare`: the ones apps would get wrong on their own (exact conversion, affine and function units, tolerance).

Operations take a quantity codec as their first argument. The codec carries the unit table, so unit checking is explicit at both type level and runtime:

```ts
import { convert, compare } from 'quanto/quantity';

const len = length();
convert(len, h, 'cm');   // Quantity<'cm'>
compare(len, a, b);      // -1 | 0 | 1
```

- **Arithmetic is left to apps.** Whether adding two values means anything is a domain question (`300 K + 5 K`, `30 mpg + 40 mpg`, an absolute temperature plus a difference), and the app knows its domain. With `convert` it's one line: `{ value: a.value + convert(len, b, a.unit).value, unit: a.unit }`.

- A value whose unit isn't in the codec's table is a type error, and throws at runtime (covering untyped JSON).
- **`compare` uses a relative tolerance** of `1e-9` on base-unit values. Five feet and sixty inches differ by an ulp after conversion; without tolerance they would compare unequal. It orders values in the base unit: with a base where bigger means more, bigger compares greater.
- Values aren't tied to the codec that parsed them. A `height` value and a `roadDistance` value are both lengths, and any codec whose table contains both units can convert and compare them. The results of operations are not re-validated against any codec's schema.
- Out of scope: dimensional algebra (length ÷ time = speed, compound SI units).

### Quantity codecs

```ts
const height = length({
  defaultUnit: 'in',   // what a bare "70" means
  canonicalUnit: 'in', // optional: always convert the parsed value to this unit
  schema: z.object({ value: z.number().min(24).max(96), unit: z.literal('in') }),
  format: feetInches,  // optional
});
```

- **`defaultUnit`** is required to accept bare numbers. Without it, `70` yields a `missing_unit` issue; this is the only way to express "a unit is required".
- **Locale-dependent defaults** are an explicit opt-in: pass a table keyed by measurement system, e.g. `defaultUnit: { us: 'in', uk: 'in', metric: 'cm' }`. The system comes from the locale's region (see [Locales](#locales)). Because the table lives on the codec, height and road distance can default differently.
- **`number`** (on `quantity()`'s definition, not a user option) replaces how numbers are read and printed, for quantities with their own number syntax. It's `{ read(text, ctx, from), format(value, ctx) }`, with `read` returning `{ value, end }` like `readNumber`, in the unit's own terms, and `format` printing something `read` reads back. It's used for every number in the input, including compound input and the `missing_unit` example, and the codec exposes it as `codec.number` so range completion can find each side's number. `pace` is the built-in user (`5:30` is 330 seconds).
- **`canonicalUnit`** narrows the value type to that unit (`Quantity<'in'>`) and turns unit-aware constraints into plain number checks that any validator can express. It is the recommended way to validate quantities.
- Without `canonicalUnit`, cross-unit constraints are written as refinements that use quanto's math, e.g. `.refine((h) => compare(len, h, { value: 8, unit: 'ft' }) <= 0)`.
- **Compound input** (`5'11"`, `5 ft 11 in`, `1 lb 4 oz`, `2h30m`) is summed into the **smallest** unit mentioned (71 in, 20 oz, 150 min), or into `canonicalUnit` if set. The smallest unit usually gives an exact integer, and it's what `canonicalUnit` users expect.
  - Components go from larger to smaller units, without repeats; `11 in 5 ft` is unparseable. Only linear units compound.
  - Only the first component carries a sign, and it applies to the whole: `-5 ft 6 in` is -66 in.
  - A trailing bare number takes the previous unit's `subunit`; without one it's unparseable.
  - Conversions scale decimal factors to integers before dividing, so `5 ft 11 in` is exactly 71 in and 1 in is exactly 25.4 mm. Factors are taken as the decimals they're written as; when the scaled integers would pass 2^53 (`hp`'s 745.69987158227022), conversion falls back to plain division, accurate to float precision.
- **Unit matching**: the longest alias wins (`miles` before `mi` before `m`), aliases may contain spaces and `/` (`fl oz`, `km/h`), and a word alias can't run into a following letter (`5 ms` is not `5 m` + `s`). A period after a word alias is skipped (`5 ft. 11 in.`). A word that matches no alias, alone or after a slash (`70 kg` in a length field, `5:30 /yd` for pace), is `unknown_unit`; anything else left over is `unparseable`.
- Default formatting prints at most 3 fraction digits, then the unit's first alias, separated by a space unless the alias is `'`, `"` or `°` (`45°`, `30'`).
- Built-in quantity codecs in `quanto/codecs`: `length`, `mass`, `duration`, `temperature`, `volume`, `area`, `speed` (its own unit table, not derived), `dataSize`, `dataRate`, `energy`, `power`, `pressure`, `angle`, `frequency`, `fuelEconomy` and `pace`, each exported alongside its unit table (`lengthUnits`, …). The core also has `percent`. Money and dates are in their own packages.
- `percent` is a plain number in percentage points (`12.5`, not `0.125`): a bare number, or one followed by `%`, `percent`, `per cent` or `pct`. A bare fraction (`3/4`) is unparseable, since it could mean 75% or 0.75%; `3/4%` is fine. Ratios (`3 in 10`), basis points and per mille are left to custom codecs.
- `duration` covers fixed-length units only (ms through weeks). Calendar durations (months, years) are not quantities because they have no fixed length. Clock notation (`1:30`) isn't accepted in v1.
- `mass` has no `ton`: it means different masses in US, UK and metric use (`t`/`tonne` is the metric ton). `volume`'s customary units are US measures; UK imperial pints and gallons need a custom table.
- `dataSize` is bytes only: `KB`, `MB`, … are decimal (1000) and `KiB`, `MiB`, … binary (1024). With no bit units, a lowercase `b` means bytes too (`100b`, `Mb`). `dataRate` has both: bit and byte aliases that differ only by case match exactly, all-lowercase `mbps`, `kbps` and `gbps` are listed as bits, and `mb/s` is ambiguous and rejected.
- `energy`'s `cal`, `Cal` and `calories` are kilocalories, as on food labels; the small calorie isn't included. `power` has both `mW` and `MW`, matched exactly. `pressure` and `frequency` have no milli- units, so `mpa` and `mhz` mean mega-. `frequency` has `rpm` but not beats per minute, which nobody converts to hertz.
- `angle` uses arcseconds as its base, so `40°26'46"` compounds exactly (degrees take arcminutes as their subunit, arcminutes take arcseconds).
- `fuelEconomy` has km/L as its base; L/100km is a function unit. `mpg` is US; UK mpg is `mpg (imp)`, as with `volume`.
- `pace` is a `quantity()` with its own number syntax: it reads clock notation (`5:30 /km`, `1:05:00 /mi`) as seconds and a plain number (`5.5 min/km`) as minutes, and formats to a tenth of a second. Its unit table is seconds per km and per mile, with the minutes word folded into the aliases (`min/km`, `minutes per mile`). A negative pace is rejected when typed; a stored negative is left to the user's schema, as for every quantity.

## Money

Money lives in **`quanto/money`**: the `money` codec, the `Money` type, its operations, `moneyRange` and `intlMoney`. It's in the core because it's complete: the value shape, the currency table, the ambiguity rules, the operations and the range rules are settled, and its data changes (a country adopting the euro) are rare, additive refreshes. It has its own subpath because it has its own types and operations. Its region data (each region's currency and where it writes the symbol) is generated by its own script, `scripts/generate-money-data.ts`.

Money is **not** a quantity. Converting currencies has no fixed factor: it needs exchange rates, which are external data that change over time.

### Values

```ts
type Money<C extends string = string> = { minorUnits: number; currency: C }; // C: ISO 4217 code
// $12.34 → { minorUnits: 1234, currency: 'USD' }
// ¥500   → { minorUnits: 500,  currency: 'JPY' }  (JPY has 0 decimal places)
// BHD 1.234 → { minorUnits: 1234, currency: 'BHD' } (BHD has 3)
```

- Amounts are **integers in the currency's minor unit**, never floats. Floats can't represent most decimal fractions (`0.1 + 0.2 !== 0.3`). Unlike measurement drift, money errors survive summing, comparison and storage, so "round in format" isn't enough.
- The number of decimal places comes from a **bundled** ISO 4217 minor-units table (two decimals by default plus the known exceptions). `Intl` is not consulted: unknown codes make it throw, and small-ICU builds report wrong digits.
- A JS number holds integers exactly up to 2^53 (~$90 trillion in cents), which is enough. `bigint` is not JSON-safe and is avoided.
- The field name `minorUnits` is deliberately explicit, so nobody mistakes 1234 for $1234.

### Operations

Opt-in, in their own subpath, with the same status as quantity operations. Unlike quantities, money keeps its arithmetic: the currency and safe-integer checks, rounding modes and loss-free splitting are exactly what apps get wrong on their own, and money has no affine or non-linear cases to rule on.

```ts
import { add, subtract, compare, scale, allocate, convert } from 'quanto/money';
```

- `add`, `subtract` and `compare` require the same currency. Mismatches always throw at runtime, and are also a type error when both currencies are literal types (`Money<'USD'>` vs `Money<'EUR'>`). Values typed as plain `Money` are only checked at runtime.
- `scale(m, factor, { rounding })` and `convert(m, 'EUR', { rate, rounding })` always round to a whole minor unit of the result currency. The caller must choose the rounding mode, because the right one depends on the domain (tax, invoicing, display). Modes use `Intl.NumberFormat`'s `roundingMode` names (`halfExpand`, `halfEven`, `trunc`, …).
- `convert`'s `rate` is how many major units of the target currency one major unit of the source buys. Differing minor units (USD → JPY) are handled. quanto never fetches rates.
- `allocate(m, ratios)` splits without losing a cent (e.g. $10 three ways → 334 / 333 / 333): each share gets its rounded-down part, and the remainder goes one minor unit at a time to shares with non-zero ratios, in order.
- Before rounding, float noise below 15 significant digits is removed, so `scale` treats `1005 × 1.1` as exactly 1105.5.
- `scale` and `convert` round to a whole minor unit only; the operations never produce fractional minor units.

### Parsing

The codec is `money({ defaultCurrency?, schema?, format? })`.

- Accepts `$12`, `12 USD`, `USD 12`, `€12,50`, `12.50 eur`, `$1.2k`, `$3M`, `$1.5bn`, and names (`12 dollars`, `12 bucks`, `12 euros`, `12 quid`, `500 yen`). Suffixes (`k`, `m`, `b`/`bn`, `t`) are case-insensitive and attached to the number: `3m` and `3M` both mean million in a money field.
- A currency can be written before the number, after it, or both, if they agree: `$12 CAD` is CAD, `€12 USD` is unparseable. Disambiguated symbols are accepted (`US$`, `C$`, `CA$`, `A$`, `NZ$`, `HK$`, `R$`, `CN¥`…).
- A sign goes before the symbol or the number (`-$12`, `$-12`), not both.
- A bare number takes `defaultCurrency`; without it, it's a `missing_currency` issue.
- A three-letter word that isn't an ISO 4217 code, or any other word in a currency position, is `unknown_currency`.
- Ambiguous symbols (`$` is used by USD, CAD, AUD, MXN…; `kr` by SEK, NOK, DKK, ISK; `¥` by JPY and CNY) resolve to the codec's `defaultCurrency` if that currency uses the symbol, then to `ctx.locale`'s currency if it does (`$` in en-CA → CAD, `$` in de-DE → USD), then to the symbol's first currency (USD, SEK, JPY).
- Input with more precision than the currency allows (`$3.459`) is an `excess_precision` issue. Sub-minor-unit prices are deferred (see below).

## Dates and times

Dates and times live in **`quanto-datetime`**: the four codecs, their grammar, `dateRange` and the `Intl` date formatters. Its grammar is the most heuristic part of quanto and the likeliest to change, so it versions on its own. The core keeps what's shared, `ctx.now()` and `context.now`; the package owns its locale data (month and weekday names, numeric date order, 12- or 24-hour clock), generated by its own script.

Values are ISO 8601 strings. They're JSON-native and parse losslessly into Temporal (`PlainDate`, `PlainTime`, `PlainDateTime`, `Instant`) if an app needs date math. quanto does no date math. A future separate package may provide it, built on Temporal.

| Codec | Value | Example |
|---|---|---|
| `date()` | calendar date | `'2026-10-02'` |
| `time()` | wall-clock time | `'15:00:00'` |
| `localDateTime()` | date and time, no offset | `'2026-10-02T15:00:00'` |
| `dateTime()` | exact moment, with the UTC offset it was entered in | `'2026-10-02T15:00:00-04:00'` |

- **Times are always `HH:MM:SS`**, with no fractional seconds, in every codec. Equal values are therefore equal strings, and `3pm` parses to `15:00:00`.
- **No time zones in the built-ins.** `dateTime()` stores a UTC offset, not an IANA zone. An offset is exact and needs no tz database. Input with an explicit offset or `Z` keeps it; input without one takes the offset of `ctx.now`, which defaults to the machine's local offset. The limitation is DST: `3pm next month` gets today's offset. Apps that need real zones write a custom codec on Temporal.
- `date()`, `time()` and `localDateTime()` values sort lexicographically. `dateTime()` values with different offsets don't; compare them as instants.
- **Only `dateTime()` values are safe with `new Date()`.** `Date` reads date-only strings as UTC and offset-less date-times as local time, and rejects bare times. Use Temporal or plain string handling for the other forms.
- **Relative input** (`tomorrow`, `next fri`, `in 3 days`) is computed from `ctx.now`. Its offset defines the local calendar in which "tomorrow" is computed. When `now` is missing, the machine's clock and local offset are used and reported in `context.now`. In a browser that's what the user means. A server parsing on a user's behalf should pass the user's `now`, because the server's offset is usually wrong for them.
- Because the parsed value is captured at entry time and stored, relative input is never re-parsed later (see the stored envelope below).
- Numeric dates follow the region's date order. `03/04/2026` is March 4 in en-US (the default) and 3 April in en-GB and en-AU. Unambiguous forms (`2026-03-04`, `4 Mar`, `13/04`) are accepted in any locale.
- **Yearless dates** (`4 Mar`, `13/04`) take the year of `ctx.now`, with the same machine default.
- **Month and weekday names: English is built in; other languages are opt-in data.** Each of `date()`, `localDateTime()` and `dateTime()` takes a `names` option: `date({ names: [de] })`. `quanto-datetime/names` exports name sets for Spanish, French, German, Italian, Portuguese and Dutch (`es`, `fr`, `de`, `it`, `pt`, `nl`), generated from ICU at development time; any other language is just a `Names` object (twelve months and seven weekdays, each a list of accepted forms, plus optional filler words).
  - **Why opt-in rather than picked from `ctx.locale`.** Opt-in sets tree-shake, and a codec's behaviour changes only when the app changes it: a later release adding a language can't silently change how existing fields parse. Locale-aware numbers stay automatic, because separators matter to every field and don't depend on vocabulary.
  - **Parsing** accepts the passed sets, in order, then English. Matching ignores case, accents (`fevrier` is `février`) and a trailing period. When a form means two things, months win over weekdays (Spanish, French and Italian `mar` is March; `martes` still works) and earlier sets win over later ones. A set's `fillers` are skipped between parts (`2 de octubre de 2026`), and a period after the day number is accepted (`2. Oktober`).
  - **Formatting** uses the set whose language matches `ctx.locale`'s language, or English: `2 Okt 2026` in de-DE, still the unambiguous day-month-year form, not the full native style (`2. Okt. 2026`). It round-trips.
  - **Names are data, grammar is code.** A name set can't add relative words in another language (`mañana`), ordinals (`1er`), or dates that aren't written with names (`2026年10月2日`); those need a custom codec.

### What the built-in grammar accepts

The four codecs share one grammar, built for the common case. Anything it doesn't fully consume is `unparseable`; nothing is silently dropped except a weekday written next to an explicit date (`Fri, Oct 2` isn't checked against the date).

- **ISO:** `2026-10-02`, `2026/10/02`, `2026-10-02T15:00`, `2026-10-02 15:00:30`, with an optional offset (`Z`, `+02:00`, `+0200`). Fractional seconds are dropped.
- **Numeric dates:** `10/2/2026`, `2.10.26`, `13/04`, with `/`, `.` or `-`, in the region's order. A month over 12 swaps with the day (`13/04` is April 13 everywhere). Regions whose order is YMD read a year-last date as day/month (`03/04/2026` is 3 April in en-CA). Two-digit years fall in the 100 years centred on `now`'s year.
- **Month names:** `Oct 2`, `October 2nd, 2026`, `2 Oct 2026`, `the 2nd of October`, `Sept 30`, `Oct. 2`, in English or any name set passed to the codec. A missing year is `now`'s year, even when that puts the date in the past (`Jan 5`, typed in September, is last January).
- **Relative dates:** `today`, `tomorrow`, `yesterday`, `in 3 days`, `in a week`, `2 weeks ago`, and weekdays. `fri` and `this fri` are today if today is Friday, otherwise the coming Friday; `next fri` is the first Friday strictly after today; `last fri` is the most recent Friday before today.
- **Times:** `3pm`, `3 p.m.`, `3p`, `3:30pm`, `15:00`, `15:00:30`, `noon`, `midnight`, `now`. `12am` is 00:00 and `12pm` is 12:00. A bare number (`3`) isn't a time.
- **Combinations:** a date and a time in either order, with optional `at`, `on` and commas: `tomorrow 3pm`, `3pm tomorrow`, `Oct 2 at 15:00`, `Oct 2, 2026, 3:00 PM`, `fri 9am`.
- **Offsets** (`dateTime()` only): `Z`, `UTC`, `GMT`, `±HH:MM`, `±HHMM`. `Z`, `UTC` and `GMT` store as `+00:00`.
- **What each codec requires:** `date()` a date and no time; `time()` a time and no date; `localDateTime()` a time, with today's date if none is written, and no offset; `dateTime()` a time, today's date and `now`'s offset when missing. A date alone in a date-time field is unparseable rather than midnight.

### Deliberately left out

Write a custom codec for any of these:

- Month and year arithmetic (`in 2 months`, `next year`) and week or month references (`next week`, `end of month`): they have no single common-sense answer.
- `next fri` meaning Friday of next week.
- Time zone names and abbreviations (`EST`, `Europe/Paris`), and DST: an input without an offset takes `now`'s offset, even for a date on the other side of a DST change.
- Clock forms like `15h30`, `3.30pm` and `1500`, and fractional seconds in stored values.
- Month-and-year without a day (`Oct 2026`), week numbers, ordinal dates, and non-Gregorian calendars.
- Numbers written as words (`three pm`), except `a`/`an`/`one` in `in a day`.
- Checking a written weekday against the date (`Mon, Oct 2`).

## Locales

`ctx.locale` drives parsing, not just formatting. It's a BCP 47 tag; when it's missing, assume en-US.

Bundled data is keyed at its natural level, and each level resolves on its own. A locale is never swapped wholesale for a different one because its language lacks data: `en-AU` must not become `en-US` and read `03/04` as March 4.

The core resolves a tag to a **language and region**, and owns the data every codec needs. Each domain owns its own data (money's currencies, dates' orders and names), keyed the same way and looked up with `lookupRegional`, so adding a language's month names is a `quanto-datetime` release that doesn't touch the core (and, being opt-in, doesn't change any existing field).

| Data | Owned by | Keyed by | Coverage |
|---|---|---|---|
| Decimal and grouping separators, grouping pattern | `quanto` | region, with language exceptions (`fr-CA`, `de-CH`, …) | Every region |
| Measurement system (`us`, `uk`, `metric`) | `quanto` | region: US → `us`, GB → `uk`, everything else → `metric` | Every region |
| Likely region of a language | `quanto` | language | About 90 languages |
| Currency | `quanto/money` | region | Every region |
| Currency symbol position (before or after the amount) | `quanto/money` | region, with language exceptions | Every region |
| Numeric date order (MDY, DMY, YMD) | `quanto-datetime` | region, with language exceptions | Every region |
| Hour cycle (12- or 24-hour clock) | `quanto-datetime` | region, with language exceptions | Every region |
| Month and weekday names | `quanto-datetime` | language | English built in; `es`, `fr`, `de`, `it`, `pt`, `nl` exported as opt-in name sets, passed with the codecs' `names` option. |

- Region data is small (about 250 regions, a few fields each), so it ships complete. Only the language data needs a supported list.
- Each package generates its data from ICU at development time, with shared helpers in the repo's `scripts/icu.ts`, and commits the output: nothing reads `Intl` at runtime. A date order ICU reports that quanto doesn't support (Kyrgyzstan's YDM) maps by whether the day comes before the month.
- A tag without a region takes its language's likely region from a small bundled table (`de` → DE, `en` → US). An unknown language with no region resolves to US.
- So `en-AU` gets DMY dates, AUD and metric, and `pt-BR` gets DMY, `,` decimals and BRL; Portuguese month names are one `names: [pt]` away.
- `context.locale` records the canonicalized tag, not the resolved data. Region data can still change between versions (a country adopting the euro); name sets can't change a codec's behaviour unless the app passes a new one.

## Locale-aware number parsing

Always make a best effort:

- A separator character that appears **more than once** is a grouping separator (`12,345,678`).
- Both separator characters present: the last one is the decimal separator. `1.234,5` → 1234.5; `1,234.5` → 1234.5, regardless of locale.
- A single separator followed by **exactly three digits** is ambiguous (`1,500`, `1.500`). The locale decides; en-US reads `1,500` as 1500 and `1.500` as 1.5.
- A single separator followed by **one, two, or four or more digits** is a decimal separator in any locale: `1,5 m` → 1.5 m, `2,25` → 2.25.
- Thousands grouping must be consistent (`1,50,000` is valid in en-IN, not in en-US).
- Other accepted forms: fractions (`1/2`, `5½`), exponents (`1e3`), suffixes (`1.2k`, `3M`) where the codec allows them.
- Input is normalized before lexing (`normalize`): smart quotes (`’ ”` → `' "`), prime marks (`′ ″`), Unicode fractions, non-breaking and thin spaces. Case is handled by matching (see [Unit tables](#unit-tables)), not by normalization.

## Formatting

Default formatters use only bundled data, so they're deterministic and round-trip under the same `ctx`, as the round-trip rule requires of built-ins:

- Numbers use the region's bundled separators (`formatNumber`).
- Quantities print the number and the unit's first alias: `71 in`, `1,8 m`. This works for custom unit tables without any extra data.
- Money prints exactly the currency's minor digits, and the currency's symbol when that symbol parses back to the same currency under the same `ctx` and codec options, and the ISO code otherwise: `$12.34` for USD in en-US, but `12.34 USD` in en-CA, where `$` means CAD. The symbol goes where the locale puts it (bundled per region, like the separators): `$12.34`, `12,34 €`, `R$12,50`, with a space after a symbol that ends in a letter (`Rp 12,50`). ISO codes always follow the amount: `12.34 CHF`.
- Dates use unambiguous forms: `Oct 2, 2026` in MDY regions, `2 Oct 2026` in DMY regions (month names from the codec's name set for the locale's language, or English), and ISO `2026-10-02` in YMD regions. Never a numeric day/month order.
- Times follow the region's hour cycle (bundled, like the separators): `3:00 PM` or `15:00`, with seconds only when they aren't zero. Date-times join the two (`Oct 2, 2026, 3:00 PM`; `2026-10-02 15:00` in YMD regions), and `dateTime()` adds the offset (`… -04:00`), so the instant survives a round trip.

`quanto/formats` has ready-made formatters for a codec's `format` option:

- **Compound formatters**, from bundled data only, so they're deterministic and round-trip: `feetInches` (`5'11"`, `6'0"`, `11"`), `poundsOunces` (`1 lb 4 oz`), `stonesPounds` (`11 st 4 lb`) and `hoursMinutes` (`2 h 30 min`; days show as hours). The smallest part is rounded to a whole number and carried (`71.6 in` is `6'0"`), leading zero parts are left out, and later zero parts are kept (`6'0"`, `2 lb 0 oz`). Each works with its built-in codec (`length`, `mass`, `duration`); given a unit outside that table, it throws.
- **`Intl` formatters**, opt-in, for richer output: `intlUnit({ unitDisplay })` in `quanto/formats` (localized unit names: `5 feet`, `5 Fuß`), `intlMoney({ currencyDisplay })` in `quanto/money` (`12.34 US dollars`), and `intlDate({ dateStyle })`, `intlTime({ timeStyle })` and `intlDateTime({ dateStyle, timeStyle })` in `quanto-datetime`. They're outside the determinism guarantee and display-only: their output varies between ICU versions and isn't guaranteed to parse back, so a field using one shows raw text for editing (`display="raw"`). `intlMoney` takes decimal places from quanto's bundled table, not Intl's. `intlUnit` covers built-in units that Intl knows, and prints the number and unit ID for the rest. `intlDateTime` shows a date-time's wall-clock time as entered, without its offset. They have no fixtures, since exact output depends on the runtime.

## Ranges

A range is two values of one codec, entered in one field. The core has the machinery and quantity ranges; money and dates bring their own range functions:

```ts
import { range } from 'quanto';
import { moneyRange } from 'quanto/money';
import { dateRange } from 'quanto-datetime';

range(length({ defaultUnit: 'ft' })).parse('5-7 ft');  // { start: { value: 5, unit: 'ft' }, end: { value: 7, unit: 'ft' } }
moneyRange(money()).parse('$10-20k');
dateRange(date()).parse('Oct 3-5');
```

- **`range(codec)`** takes a quantity codec (one with a unit table, including `pace`); the type system enforces it. **`moneyRange`** and **`dateRange`** (for all four date and time codecs) come from their packages.
- **`defineRange(codec, rules?, options?)`** is what they're all built on, and it's public, like `defineCodec`. It does everything that isn't domain-specific: splitting, trying completions, choosing between them, the user's schema, the `start`/`end` schema and formatting. `rules` supply the domain part:
  - `propose(left, right, ctx)` returns textual completions of the two sides, most preferred first. The sides as typed are always tried after them.
  - A proposal may carry `adjustEnd(end)`: if the sides parse out of order, try this end instead (checked against the inner codec's schema). Dates use it to roll into the next day or year, since "the next day" can't be written back into text like `tomorrow`.
  - `inOrder(start, end)` says whether the range is in order, or `undefined` when it can't tell.
  - With no rules, both sides must be written in full. That's the right default for a custom codec with no shorthand.
- The value is `{ start: T; end: T }` using the inner codec's values. There is one `raw` for the whole field, not one per endpoint.
- Every range function takes the shared options (`{ schema?, format? }`). The `id` is derived like merge's, `range(length)`, so `merge([length(), range(length())])` is valid and can accept both `5 ft` and `5-7 ft`.
- **Inner codecs know nothing about ranges.** Codecs have no range hook; range rules live with the range function of their domain.
- Parsing is **two passes**:
  1. **Split.** Separators: `-`, `–`, `—`, `to`, `until`, `through`. Hyphens also appear inside values (negative numbers, ISO dates `2026-10-03`), so every candidate split is tried.
  2. **Complete and parse.** For each split, the rules propose completions. Both sides of each are parsed with the inner codec, and the first completion where both parse and `start <= end` wins; then the first that's in order after `adjustEnd`; then the first that parsed at all.
- **The completion rules of each domain.** The rule throughout: a side borrows what it's missing from the other side, and when borrowing could go two ways, the reading that keeps `start <= end` wins.
  - Quantities (`range`): a side with no unit borrows the other side's unit text. `5-7 ft` → 5 ft–7 ft; `5'10"-6'` needs nothing. Each side's number is read with the codec's own number syntax, so pace ranges complete too: `5:00-5:30 /km`.
  - Money (`moneyRange`): a side with no currency (symbol or code) borrows the other side's: `$10-20` → $10–$20, `10-20 EUR` → €10–€20. A side with no magnitude suffix borrows the other side's only if the result stays in order: `$10-20k` → $10k–$20k and `$1.5-2M` → $1.5M–$2M, but `$500-1k` → $500–$1,000.
  - Dates (`dateRange` over `date()`): a side with only a day number borrows the other side's month and year: `Oct 3-5` → Oct 3–Oct 5. A side with no year borrows the other side's. When neither side has a year and the end would fall before the start, the end moves to the next year: `Dec 30 - Jan 2` → Dec 30, 2026–Jan 2, 2027.
  - Times (`dateRange` over `time()`): a side with no meridiem borrows the other side's, unless that would put the start after the end, in which case the start takes the opposite meridiem. `9-11pm` → 9pm–11pm; `9-5pm` → 9am–5pm.
  - Date-times (`dateRange` over `localDateTime()` or `dateTime()`): a side with no date borrows the other side's, wherever the date was written: `Oct 3 3-5pm`, `tomorrow 3-5pm` and `3-5pm tomorrow` all put both times on one day. The times complete as for times. When both sides share a borrowed date and the end time is before the start time, the end moves to the next day: `Oct 3 10pm-1am` → Oct 3, 10pm–Oct 4, 1am. For `dateTime`, a side with no UTC offset borrows the other side's written offset, before falling back to `ctx.now`'s.
- **Which split wins:** splits are tried left to right, and the first split with any completion where both sides parse provides the value. If none does, the result carries the issues of the first side that failed, which is the most specific failure (`5-7 kg` reports `unknown_unit`, from `5 kg`). Text with no separator is `unparseable`.
- **Where ordering is knowable:** quantities (compared in the base unit, with `compare`'s tolerance), money in a single currency, dates, times and local date-times (as strings), and date-times (as instants). A range built with `defineRange` and no `inOrder` counts every reading as in order.
- **Formatting** prints both sides in full, separated by ` – ` (an en dash with spaces): `5 ft – 7 ft`, `$10.00 – $20.00`. It reads back under the same `ctx`, even with negative values.
- Ordering only picks between completions. It isn't enforced: `7-5 ft` parses as typed, and rejecting it is left to the user's schema, which can use `compare` from `quanto/quantity` or `quanto/money`.
- Open-ended ranges (`5ft+`, `under 10 kg`) are deferred.

## The stored envelope

Wherever a value is entered by a person, store both the text and the parsed value:

```ts
type QuantoValue<T> =
  | { raw: string; value: T }        // parsed and valid
  | { raw: string; issues: Issue[] }; // didn't parse, or failed validation
```

- `raw` is exactly what was typed, or `format(value)` if the value was set by a picker or default.
- **There is never a value alongside issues.** A value that fails validation is not stored, so nothing downstream can mistake it for a valid one.
- `value` is parsed at entry time and is authoritative. `raw` is kept for audit, display and re-editing.
- The parse `context` is not part of the envelope. Apps that want replay store it separately (see [Parse context](#parse-context)).
- Servers validate `value` with `codec.schema`, and store the schema's output, which equals `value` when the schema only validates. They never need to re-parse `raw`, which would give different results for relative input.
- A restored `raw` is never re-parsed unless the user edits it.
- Value shapes (`Quantity`, `Money`, the date forms) are stored contracts and change only with a major version.

## The input component

`<QuantoInput />` is a thin UI over a codec's `parse` and `format`. It lives in a separate package (`quanto-react`, name TBD), so the core package has no UI code and no React dependency. Everything UI-specific (accessories, keyboard hints, display modes, echo) is a component prop, never a codec property.

```tsx
import { QuantoInput } from 'quanto-react';
import { length } from 'quanto/codecs';
import { feetInches } from 'quanto/formats';

<QuantoInput
  codec={length({ defaultUnit: 'in', format: feetInches })}
  defaultValue={{ value: 70, unit: 'in' }}  // raw = format(value)
  defaultRaw={`5'10"`}                       // with defaultValue: restore exactly, no re-parse
  onChange={(v: QuantoValue<T>, { context }) => {}}  // fires on commit: blur, Enter, picker selection
  display="formatted-on-blur"               // | 'raw' | 'formatted'; use 'raw' with a display-only formatter
  inputMode="text"                          // mobile keyboard; see below
  accessory={CalendarPicker}                // optional
/>
```

- **Uncontrolled by default**, since it owns the envelope internally. An optional controlled `value: QuantoValue<T>` is available.
- **`onChange`'s second argument** carries the parse `context` (absent when the value didn't parse), for apps that store it for replay.
- **No `codec`** means plain text: the value is the text itself (`{ raw, value: raw }`), and no codecs are bundled. An "accept anything" codec is deferred (see `auto` under [Deferred](#deferred)).
- **Live echo**: the component may parse on every keystroke to show its interpretation (`5 ft 11 in · 180 cm`), but only emits `onChange` on commit. There is no "incomplete" parse state; while the text doesn't parse, the echo simply shows nothing, and errors are shown only on commit.
- **Raw display** always shows the interpretation next to the text, so stale relative input (`tomorrow`) is never misleading.
- **Accessories** are a component prop (e.g. a calendar icon that opens the OS picker). An accessory receives `{ value, onChange, focused }`, and selecting a value sets `raw = format(value)`. Text entry always stays available.
- **Keyboard hint** is the `inputMode` prop, passed through to the input. Height needs a keyboard that can type `'` and `"`, which a numeric keypad can't, so the default is `text`.
- **Form libraries** are not a design driver. quanto exposes `value` / `onChange` / `onBlur` / `ref`, which is enough for React Hook Form's `Controller` and TanStack Form.
- **Platforms**: the core is pure TypeScript with no runtime dependencies and no UI code. Web is first. React Native is another separate adapter over the same core.

## Packaging

- ESM only, with `"sideEffects": false`.
- No runtime dependencies. The Standard Schema interface is vendored into `src/` (types only), as the Standard Schema spec recommends, so there is no dependency on `@standard-schema/spec`.
- Subpath exports:
  - `quanto`: core. `defineCodec`; `formatWithFallback`; the primitives `normalize`, `readNumber` and `formatNumber`; `merge`, `optional`, `range` and `defineRange`; and the types `Codec`, `CodecOptions`, `Ctx`, `ResolvedCtx`, `Locale`, `ParseResult`, `ParseOutcome`, `ParseContext`, `Issue`, `IssueCode`, `QuantoValue`, `Quantity`, `Range`, `RangeRules`, `RangeProposal` and `UnitTable`.
  - `quanto/codecs`: `quantity` and the `NumberSyntax` type; the built-in quantity codecs and their unit tables (`length`/`lengthUnits`, `mass`/`massUnits`, …); `percent`.
  - `quanto/quantity`: quantity operations (`convert`, `compare`).
  - `quanto/money`: `money`, the `Money` type, `add`, `subtract`, `compare`, `scale`, `convert`, `allocate`, `roundWithMode`, `moneyRange`, `intlMoney`, and the currency data (`isKnownCurrency`, `minorDigits`).
  - `quanto/formats`: ready-made formatters (`feetInches`, `poundsOunces`, `stonesPounds`, `hoursMinutes`, `intlUnit`) and the `Formatter<T>` type.
  - `quanto/testing`: `roundTrip` and `runFixtures`, the generic fixture runner.
- **Repository layout.** A bun workspace: `packages/quanto` (the core, npm `quanto`), `packages/datetime` (`quanto-datetime`) and `apps/site` (the website). The private root holds the shared dev tooling (TypeScript, tsdown, vitest, `tsconfig.base.json`, one `vitest.config.ts` for every package) and the repo docs (`DESIGN.md`, `AGENTS.md`, `PRIOR_ART.md`). `bun run typecheck`, `bun run build` and `bun run test` at the root cover every package.
- UI adapters are separate packages (web React first, React Native later). The core package never imports them.
- **`quanto-datetime`** (`packages/datetime`) is the one separate package: `date`, `time`, `localDateTime`, `dateTime`, `dateRange`, `intlDate`, `intlTime`, `intlDateTime`.
- **Core or package?** First-party codecs whose behaviour is complete and settled go in the core: unit tables (`length`, `dataSize`), small parsers (`percent`, `pace` with its number syntax), and finished domains with their own subpath (`quanto/money`). A domain that's intentionally incomplete or still evolving, so its parse results are expected to change between releases, gets a dedicated package: `quanto-datetime`, whose grammar covers the common case with a list of omissions that will shrink.
- **Why packages.** Not bundle size: everything tree-shakes. An evolving domain's parsing rules change on their own schedule, and parse changes affect replay (see [Parse context](#parse-context)). A package lets that domain evolve without moving the core's version, while the core stays steady.
- **How they're built.** A separate package uses **only quanto's public API**, imported by name (`quanto`, `quanto/codecs`, `quanto/quantity`, `quanto/testing`), exactly as a custom codec would. That keeps Principle 5 honest: anything a package needs that isn't public is a gap in the API, not a reason to reach into internals.
  - `quanto` is a peer dependency (`workspace:^` in the repo, replaced by the real version on publish). In the repo, `quanto` resolves to the core's source (tsconfig paths for typechecking, a vitest alias for tests), so nothing needs building first.
  - Their codecs follow the same rules as the core's: extensive fixtures, round-trip properties, and `DESIGN.md` as the source of truth.
- Nothing is attached to the component or a namespace object.
- **Consumer reference.** The README's "Using quanto" section and the TSDoc on the exported types are the reference for apps and agents using quanto. The README ships in every npm package, so it's at `node_modules/quanto/README.md`; the TSDoc reaches agents at the point of use, through the published `.d.ts` files. The storage rules (store `{ raw, value }`, `value` is authoritative, never re-parse `raw`, validate with `codec.schema`, `context` is opt-in) must appear in both, in particular on `ParseResult`, `QuantoValue`, `ParseContext` and `Codec.schema`. A SKILL.md, if one is ever shipped, is generated from the README, never the source of truth.
- The package ships an `AUTHORING.md` (see below) so it is discoverable inside `node_modules`. It is deliberately not called `AGENTS.md`: the repo's root `AGENTS.md` holds instructions for agents working on quanto itself and is not shipped.

## Testing: fixtures are the spec

Every codec, built-in or custom, ships fixtures, and CI enforces it. Fixtures are the codec's spec: they pin down everything finicky about it. For built-in codecs they are extensive, covering common inputs, locales, compound forms, every issue code the codec can produce, alternatives, parse context and formatting. Fixtures are **JSON**, next to the codec, so they can be read and written without touching TypeScript and run by one generic runner:

```jsonc
// src/codecs/length/fixtures.json
[
  { "parse": "5'11\"", "ctx": { "locale": "en-US" }, "value": { "value": 71, "unit": "in" } },
  { "parse": "1,8 m",  "ctx": { "locale": "de-DE" }, "value": { "value": 1.8, "unit": "m" } },
  { "parse": "70 kg",  "issues": ["unknown_unit"] },
  { "parse": "70",     "issues": ["missing_unit"] },
  { "parse": "70",     "options": { "defaultUnit": "in" }, "value": { "value": 70, "unit": "in" } },
  { "format": { "value": 1.8, "unit": "m" }, "ctx": { "locale": "de-DE" }, "text": "1,8 m" }
]
```

```jsonc
// src/merge/fixtures.length-duration.json
[
  { "parse": "1m",
    "value": { "codec": "length", "value": { "value": 1, "unit": "m" } },
    "alternatives": [{ "codec": "duration", "value": { "value": 1, "unit": "min" } }] }
]

// src/codecs/date/fixtures.json
[
  { "parse": "tomorrow", "ctx": { "now": "2026-09-30T23:30:00-04:00" }, "value": "2026-10-01",
    "context": { "locale": "en-US", "now": "2026-09-30T23:30:00-04:00" } }
]
```

- A **parse fixture** is `{ parse, ctx?, options?, value | issues, alternatives?, context? }`. `issues` lists the expected issue codes, in order. A missing `alternatives` means none are expected. `context` is checked only when given.
- A **format fixture** is `{ format, ctx?, options?, text }`.
- `options` are passed to the codec factory, so one file covers the factory's JSON-expressible options (`defaultUnit`, `canonicalUnit`, `defaultCurrency`…).
- A codec can have several fixture files (`fixtures.json`, `fixtures.<variant>.json`). Wrappers (`merge`, `range`, `optional`) have fixtures too, one file per inner-codec combination worth pinning down: `range` over `date` for completion, `merge` over `length` and `duration` for alternatives.
- **`runFixtures(factory, fixtures, { test })`** in `quanto/testing` runs a file. It takes the test function (vitest's `test`, `node:test`…) rather than importing a framework. Each case is named after its input and context, so a failure reads as input, expected and actual.
- Fixtures must not depend on the machine. The runner fails any fixture whose result `context` has a `now` the fixture didn't pass; time-dependent fixtures pass `ctx.now`.
- An LLM adding a codec writes the fixtures **first**, then the parser.
- **Round-trip property.** Required for every built-in codec, and for any custom codec whose formatter is meant to round-trip: `parse(format(v))` round-trips within the formatter's rounding across a set of values. The `roundTrip(codec, values, { test })` helper in `quanto/testing` does this; `values` is a plain array, so no property-testing library is needed.
- **What isn't tested:** plumbing. No unit tests that a factory returns a codec, that `defineCodec` wires up `schema`, that definition-time errors fire, or that types infer. Behaviour that matters shows up in fixtures; the rest shows up in typecheck or on first use.
- Built-ins follow the same rules. They have no private escape hatches.
- **One check command.** `bun run check` runs typecheck, unit tests, all fixture files and the round-trip properties. In the quanto repo, CI runs it; implementing agents don't (see `AGENTS.md`). App authors run it for their own codecs.
- **`AUTHORING.md`**, shipped in the package, is the codec authoring guide: `defineCodec`, the primitives, the file layout (`src/codecs/<name>/{index.ts, fixtures.json}`), the issue codes, the fixture format, the round-trip rule and the check command. It stays short.

## Async codecs (v2)

Deferred to v2 and designed now, so v1 doesn't block it. The marquee example is an **LLM-powered codec**: a model parses free text into a structured value and formats it back as natural prose.

### Shape

Async is an additive second interface, not a change to `Codec`:

```ts
interface Codec<T> {                 // v1, unchanged
  async?: false;                     // absent means sync, so every v1 codec stays valid
  parse(text: string, ctx?: Ctx): ParseResult<T>;
  format(value: T, ctx?: Ctx): string;
  // id, schema…
}

interface AsyncCodec<T> {
  async: true;
  parse(text: string, ctx?: Ctx): Promise<ParseResult<T>>;
  format(value: T, ctx?: Ctx): Promise<string>;
  // id, schema…
}
```

- **Sync stays sync, down to the types.** Nothing about a sync codec changes, and a sync codec's `parse` never returns a Promise.
- **One code path, no parallel API.** There is no `mergeAsync` or `quanto/async`. The wrappers (`merge`, `range`, `optional`) accept both kinds, and their return type is conditional (not an overload): the result is an `AsyncCodec` if any inner codec is async, otherwise a `Codec`. Each wrapper computes its `async` flag once, at construction.
- **Wrapper internals are written once, as generators** that `yield` inner parse results. A sync runner steps straight through and never allocates a Promise; an async runner awaits each step. This is the gensync pattern, and it keeps sequential logic like range's candidate splits readable.
- **Async is always explicit.** A custom async codec declares `async: true`. A built-in factory given an async schema takes an `async: true` option, which switches its return type to `AsyncCodec`.
- **Consumers that accept either kind** can always `await codec.parse(text)`; awaiting a non-Promise is harmless.

### Additions that come with it

- **`ctx.signal?: AbortSignal`** cancels an in-flight parse or format. The input component needs it, since every keystroke can start a new parse.
- **`context` records non-determinism.** An LLM parse isn't reproducible, but Principle 8 only requires the stored value to be stable. `ParseContext` gains room for provenance, and an LLM codec records what produced the value (e.g. `context.model`) alongside `now`.
- **Frozen formatting.** `QuantoValue`'s valid branch gains an optional `formatted: string`: the formatted text, computed once and stored. Anything that displays a value (the component, an app's list view) uses `formatted` when present instead of calling `format` again. The component fills it at commit for async codecs, because it formats then anyway. Apps can fill or clear it themselves. It is a cache of `format(value)` and is never authoritative: it reflects the locale it was formatted in, and it is dropped whenever `value` changes.
- **The component** checks `codec.async` to debounce the live echo, show a pending state and discard stale results.

### Testing LLM codecs

LLM output isn't reproducible, so fixtures and the round-trip property run against a **stubbed model**:

- **The model is injected.** An LLM codec takes its model as a `model` option: a plain async function from request to response. quanto has no LLM SDK dependency, and swapping in a stub is just passing a different function.
- **Every LLM codec ships a stub** next to its fixtures (`src/codecs/<name>/stub.ts`): a hard-coded, deterministic model, typically a lookup table from prompt input to canned response. The fixture runner and `roundTrip` pass it as `model`. Fixture files stay plain JSON and follow the same rules as any other codec.
- **Round-trip uses the same stub.** If the codec's formatter is meant to round-trip, `parse(format(v))` must return `v` when both calls go through the stub. A prose formatter that is display-only skips it.
- **What this covers:** the codec's own code (prompt building, reading model output, validation, issue mapping, `context`). What it doesn't: how accurate the real model is. That's an eval, run outside CI, and not part of the codec's definition of done.

## Non-goals

- A validation or constraint API (delegated to Standard Schema).
- Object or array schema composition (that's what Zod, Valibot and ArkType are for).
- Date math (possible future separate package, built on Temporal).
- Dimensional algebra.
- Fetching exchange rates or any other external data.
- Configuration knobs for edge cases in built-in codecs (write a custom codec instead).
- IANA time zones in built-in codecs (write a custom codec on Temporal instead).

## Deferred

Decided in principle, not in v1:

- **Sub-minor-unit money** (`$3.459`): an optional `precision` option on the money codec.
- **Calendar durations** (`2 months`): a separate codec with an ISO 8601 duration value (`P2M`).
- **Open-ended ranges** (`5ft+`, `under 10 kg`).
- **Ranges over a merge** (`5-7 kg` against `merge([length(), mass()])`): `range()` takes a quantity codec, and a merged codec has no single unit table. Dropped on purpose when `range()` became quantity-only; `defineRange(merged, rules)` with custom rules covers it if needed.
- **Gas mark** (`gas mark 4`): the number follows the unit, and only a few discrete marks exist, so it's a custom codec rather than a function unit.
- **`auto`**, an "accept anything" codec: a merge of all built-ins plus a text fallback. Its merge order and what bare numbers mean are undecided.
- **Agent tooling** beyond the basics above: an `explain(codec, text, ctx)` trace, a CLI with JSON output, a `new-codec` scaffold, and JSON Schema exports for the value shapes.
- **Async codecs** (v2), including frozen formatting: see [Async codecs (v2)](#async-codecs-v2).
- **React Native adapter**, including how accessories are split between platforms.

## Open questions

1. The input component name (`QuantoInput` is a placeholder).
