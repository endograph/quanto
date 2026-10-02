# quanto — Design

Status: implemented, pre-release (0.1.0). This document is the source of truth for the design: the decisions made, and the questions still open.

## What this is

quanto is a library for turning messy human text into well-typed values, and back again, for any kind of value: lengths, weights, durations, money, dates, and custom types.

Think of it as a universal moment.js, generalized beyond dates, or as "what if Zod were unit-aware". `5'11"`, `180cm` and `1,8 m` all parse into the same typed value, which can be converted, compared and formatted.

It ships as a core with no codecs, plus codec packages built on the core's public API (see [Packaging](#packaging)):

- **`quanto` is the protocol**: the codec contract, the definition helpers (`defineCodec`, `defineExternalCodec`, `quantity`, `defineRange`), context, issues, composition (`merge`, `optional`, `approx`, `range`, `dimensions`) and the shared parsing primitives. It holds strong opinions, and every codec is expected to conform to them.
- **The codecs are a bootstrap**: `@quantojs/common` has the settled common ones (quantities, numbers, money, odds, text), and dedicated packages have domains that are incomplete or still evolving, like dates (`@quantojs/datetime`). Use them as they are, copy and modify one, or write your own: a codec of yours is no different from theirs.

The input component (`<QuantoInput />`) is one consumer of this core, shipped as a separate package. It is not the core, and nothing UI-specific lives in the core.

## Principles

1. **Values are plain, immutable, JSON-safe data.** No class instances. The same value works on client and server without serializers.
2. **Operations are standalone functions.** Nothing is hung off a prototype or namespace object. Everything is a named export and tree-shakes. There are no overloads. Subpaths and packages act as namespaces, so `quanto/quantity` and `@quantojs/common/money` can both export `convert`; import with an alias when a file needs both.
3. **Context is explicit when you want it, inferred when you don't.** `locale` and `now` can be passed in. When `now` is missing, parsing uses the machine's clock and local offset, because that is what the person typing means. Every successful parse reports the `context` it was based on (see [Parse context](#parse-context)), so apps that want replayability can keep it. There is no global, mutable context.
4. **Don't rebuild what exists.** Validation is delegated to Standard Schema libraries (Zod, Valibot, ArkType…). Opt-in rich formatters lean on `Intl`. Date math, if ever shipped, is a separate package built on Temporal.
5. **One contract, two authors.** First-party codecs and custom (often LLM-written) codecs use the exact same API and the same fixture requirements. Every first-party codec is defined with `defineCodec` and the exported primitives, in a package separate from the core, so it can't reach into internals. First-party codecs get no special hooks.
6. **Explicit over ergonomic.** Agents will write most custom codecs and unit tables, so APIs favor explicitness and good descriptions over brevity.
7. **Common case only, in the first-party codecs.** First-party codecs implement common-sense behaviour with no knobs for edge cases. Anyone who needs different behaviour writes a custom codec, which has full control over parsing, formatting and units.
8. **Stable once stored.** User ergonomics come first at parse time: parsing may infer from the machine (clock, local offset). Stability is required of what's stored: once `raw` and `value` exist they are the source of truth and are never re-parsed behind the user's back. Given the same text and the same context, parsing gives the same value on every runtime, because the data it needs (currency minor units, month names, separators) is bundled rather than read from `Intl`. Default formatting uses the same bundled data; `Intl` is used only by opt-in formatters (`intlUnit`, `intlMoney`, the date ones).
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
  | { ok: true; value: T; context: ParseContext; alternatives?: T[] }
  | { ok: false; issues: Issue[]; alternatives?: T[] };  // alternatives: other readings of the text; see Alternatives

type Ctx = {
  locale?: string;  // BCP 47. Missing → en-US. See Locales.
  now?: string;     // RFC 3339 timestamp with a UTC offset. Missing → the machine's clock and local offset.
  grammars?: Grammar[];  // other languages' grammars, tried before the built-in English. See Grammars.
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
- **`formatWithFallback(codec, value, fallback, ctx?)`** is for displaying data that may be malformed (legacy rows, a unit since removed from the table). It returns `fallback` where `format` would throw on a malformed value. `isInvalidValueError(error)` tells that error apart for callers that handle it themselves. Any other error, such as a bug in a formatter, still throws, so the fallback never hides bugs. `value` is typed `unknown`, since the point is untrusted data.
- **`parse` and `format` are synchronous.** Parsing that has to call out (a model, a server) uses a separate interface, external codecs, with an async `parse` and the same sync `format` and `schema` (see [External codecs](#external-codecs)); `Codec` will not change.
- **Round-trip.** A formatter round-trips when `parse(format(v))` succeeds and differs from `v` by no more than the formatter's rounding. Formatting is the only place precision is lost.
  - **First-party default formatters must round-trip.** That matters wherever formatted text becomes editable `raw`: a picker or `defaultValue` sets `raw = format(value)`, and formatted display shows text the user then edits. A formatter that doesn't round-trip turns one keystroke and a blur into a silently changed value (`1.83 m` shown as `2 m`, re-parsed as 2 m).
  - **Custom formatters should round-trip**, whether a custom codec's default or a `format` option. Display-only formatters (prose, heavy rounding) are allowed. A field using one must not show formatted text as editable (use `display="raw"` in the component) and must not set `raw` from it.
- **`schema`** is a composed Standard Schema over `T`: quanto's own structural check (the unit is in the codec's table, the currency is known, the string is a valid date…) followed by the user-supplied `schema` option, if any. Servers validate stored values with it and never need to re-parse. The codec itself is deliberately not a Standard Schema, because "validate a string" and "validate a structured value" are different operations.

Codecs are created by factory functions that take an options object. Option names shared across codecs:

| Option | Meaning |
|---|---|
| `schema` | A **synchronous** Standard Schema from `T` to `T` (`StandardSchemaV1<T, T>`). `parse` runs it on the parsed value and keeps its output, so it can normalize as well as validate (round, clamp to a canonical form). Transforms must be idempotent, because the schema runs again on values that already went through it: a server validating a stored value, or re-parsing formatted text. This is the only validation mechanism. |
| `format` | `(value: T, ctx: ResolvedCtx) => string`. Replaces the codec's default formatter. Should round-trip (see above). |

These two make up `CodecOptions<T>`. Codec-specific options (e.g. `defaultUnit`, `canonicalUnit`, `defaultCurrency`) extend it and are documented per codec.

### Defining a codec

`defineCodec` is how every codec is built, first-party or custom. The author supplies the parts specific to the value; `defineCodec` supplies everything every codec must do the same way.

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
| `parse(text, ctx)` | Returns `ParseOutcome<T>`: `{ ok: true; value; alternatives? } \| { ok: false; issues; alternatives? }`. No `context`. |
| `format(value, ctx)` | The default formatter. |
| `check(value: unknown)` | The structural check: returns `{ message, path? }[]`, empty when `value` is a well-formed `T`. |
| `options?` | The caller's `CodecOptions<T>`, passed through. |

`defineCodec` then:

- Returns an `empty` issue for empty or whitespace-only input, without calling the author's `parse`. The author's `parse` receives the text trimmed, but otherwise untouched: call `normalize` if the codec wants it.
- Resolves `ctx` into a `ResolvedCtx` (below) and passes it to `parse` and `format`.
- Runs `check` on the parsed value. A failure is a bug in the codec, so it throws.
- Runs `options.schema` and keeps its output as the value. Its issues are wrapped with `code: 'invalid'`; a Promise throws.
- Runs `check` and `options.schema` on each alternative the same way, keeping the schema's output. A `check` failure throws; an alternative the schema rejects is dropped, since it can't be chosen.
- Attaches `context` to a successful result.
- Uses `options.format` in place of the author's `format` when given.
- Runs `check` before formatting, and throws quanto's invalid-value error when it fails. That is the error `formatWithFallback` catches.
- Builds `schema`: `check`, then `options.schema`, as one Standard Schema.

```ts
interface ResolvedCtx {
  locale: Locale;  // the resolved bundled data for ctx.locale; see Locales
  now(): string;   // ctx.now, or the machine's clock and local offset.
                   // Calling it records `now` in the result's context.
  grammars: Grammar[];  // ctx.grammars, or none
  // …and any package's extensions (CtxExtensions), as passed
}
```

Reading the clock through `ctx.now()` is what keeps `context` accurate without any bookkeeping in the codec.

**Extensions.** A package that needs app-wide settings of its own declares a key on `ctx` by augmenting the `CtxExtensions` interface, which `Ctx` and `ResolvedCtx` both extend:

```ts
declare module 'quanto' {
  interface CtxExtensions {
    readonly music?: MusicCtx;   // @quantojs/music: { key?: string }
  }
}
```

quanto passes every key it doesn't own through to `ResolvedCtx` untouched, so the setting reaches codecs inside `merge`, `range` and `approx`, and comes from the React provider like `locale` does. Each package validates its own key and owns its meaning. One key per package, named for it, so packages can't collide. Extensions aren't recorded in `ParseContext`, so an extension that changes what `parse` returns makes replay depend on passing it again; keep them to formatting where possible (`ctx.music.key` only changes spelling).

### Primitives

The lexing every first-party codec uses is exported from `quanto`, so custom codecs get the same locale behaviour and the same determinism:

- **`normalize(text)`**: the input normalization described under [Locale-aware number parsing](#locale-aware-number-parsing): quotes and primes, Unicode fractions (`5½` → `5 1/2`, and typeset `1¹⁄₂` → `1 1/2`), superscript exponents on a number (`10³` → `10^3`), NFKC (so full-width digits read as digits), the Unicode minus sign, and runs of any whitespace to one space. It doesn't fold case or trim.
- **`readNumber(text, ctx, { from?, suffixes? })`**: reads one number starting at `from` (default 0, leading spaces skipped) using the locale rules, and returns `{ value, end }` or `undefined`. It accepts a leading `-` or `+`; whether negatives make sense is the codec's call. `suffixes: true` accepts `k`, `m`, `b`/`bn` and `t`, attached to the number and case-insensitive. Without `suffixes`, it reads a product of powers (`10^3`, `2*5`, `6.02×10^23`) and math constants (`π/2`, `2π`); see [Locale-aware number parsing](#locale-aware-number-parsing). When the locale's reading of an ambiguous separator gives invalid grouping, the other reading is used (`1234,567` in en-US is 1234.567).
- **`formatNumber(n, ctx, { maxFractionDigits?, minFractionDigits? })`**: formats with the region's bundled separators and grouping, so the result reads back with `readNumber`. Defaults: at most 2 fraction digits, at least 0; rounding is half away from zero, on the number's shortest decimal representation (`1.005` → `1.01` at two digits). Space and apostrophe grouping print as plain ` ` and `'`. From 10²¹ up, where a double's digits past the first 17 are noise, it prints a power of ten instead: `1.62×10⁶⁵`, or `10¹⁰⁰` when the factor is 1, with the fraction-digit options applying to the factor. `readNumber` reads both back (superscripts normalize to `^`).
- **`readNumberToken(text, ctx, { from? })`** and **`readWordToken(text, ctx, from)`**: read a number in digits or in words like `readNumber`, but keep its digits as text (a `NumberToken`), for codecs that must stay exact. **`formatDecimalParts(int, frac, ctx)`** prints such digits with the locale's separators. Money uses all three.
- **`numberSpan(side, ctx, read)`**: where the first number in one side of a range starts and ends, for `defineRange` rules that complete a side (money's range uses it).
- **`ctx.locale`**: the resolved language and region, the number separators and grouping, and the measurement system, for codecs that need them directly.
- **`lookupRegional(locale, regions, exceptions?)`**: looks up a codec's own region-keyed data (the `language-region` row if there is one, otherwise the region's), so every codec resolves a locale the same way. `@quantojs/common/money` uses it for currencies, `@quantojs/datetime` for date orders and clocks, and custom codecs for their own tables.

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

- `ParseContext` is assignable to `Ctx`, so replay needs no merging. It doesn't record `grammars`, which are code, not data: replay passes the same grammars alongside it.
- Replay is exact on the same versions of `quanto` and of the package that owns the codec: a date's result depends on `@quantojs/datetime` as well as the core. A later version of either can differ where its parser or bundled data changed, which is exactly what a migration wants to detect. `context` doesn't record versions; apps that need exact replay keep their dependency versions alongside (a lockfile in their history is usually enough).

### Grammars

A **grammar** is how one language writes the things codecs read. English is built in and always on; other languages are opt-in, passed in `ctx`:

```ts
const ctx = { locale: 'de-DE', grammars: [de] };
length().parse('fünfundzwanzig m', ctx);   // 25 m; "twenty-five m" still reads too
```

```ts
interface Grammar {
  language: string;          // BCP 47 language subtag: 'de'
  numbers?: NumberGrammar;   // numbers in words
}
interface NumberGrammar {
  // A number in words at `from`, as plain digit text ("1500.5", "2/3", "2 3/4") and the index past the words.
  read(text: string, from: number): { text: string; end: number } | undefined;
}
```

- **Open-ended by design.** Every part of a grammar is optional, and each codec uses the parts it knows. `numbers` is the first; others (unit words, relative dates) can be added as new optional parts without changing the API.
- **A grammar returns digits, not a number.** quanto reads the digit text with its own exact lexer, so money stays exact and thirds stay fractions, and a grammar can't produce a value quanto couldn't read from digits. Text that isn't plain digit text throws, naming the grammar.
- **A grammar reads one well-formed number or nothing.** It should return undefined for words that don't form one number (`two fifty`), so nothing is guessed.
- **In `ctx`, not on each codec**, unlike month names: number words matter to every codec, and `ctx` reaches through `merge`, `range` and `approx`, and through the React provider, so an app sets them once. Being opt-in keeps the rule that a field changes only when the app passes something different.
- `ctx.grammars` are tried in order, then English; the first that reads a number wins.

### Issues

Every issue quanto produces has the Standard Schema issue shape plus a `code` from a closed union:

```ts
type IssueCode =
  | 'empty'             // input is empty or whitespace only
  | 'unparseable'       // text could not be understood at all
  | 'missing_unit'      // bare number and the codec has no defaultUnit
  | 'unknown_unit'      // a unit was written but isn't in the codec's unit table ("70 kg" in a length field)
  | 'incompatible_unit' // a unit on another scale than the one required ("85 dB" where canonicalUnit is dBA)
  | 'missing_currency'  // bare number and the codec has no defaultCurrency
  | 'unknown_currency'  // a currency was written but isn't known ("12 XYZ", "12 bananas")
  | 'excess_precision'  // "$3.459" for a two-decimal currency
  | 'wrong_count'       // more or fewer parts than allowed ("24 × 36 × 10" where two are)
  | 'ambiguous'         // the text reads several ways and the codec won't choose; see Alternatives
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

`schema` must be synchronous, for every codec, external ones included: quanto has no async validation, and checks that need a server belong to the app after commit. Standard Schema has no async flag, so an async schema can't be detected at definition time: if its `validate()` returns a Promise, `parse` throws.

### Empty input and optional fields

`parse('')` (and whitespace-only input) returns an `empty` issue. Required-ness is therefore the default. To allow empty:

```ts
const maybeHeight = optional(length({ defaultUnit: 'in' }));
maybeHeight.parse('');   // { ok: true, value: null }
```

`optional` is a wrapper, like `range`. It keeps the inner codec's `id`. Its value type is `T | null` and its `schema` accepts `null`. It is the one wrapper that also takes an external codec, since it never parses (see [External codecs](#external-codecs)).

### Approximate values

```ts
const height = approx(length({ defaultUnit: 'ft' }));
height.parse('about 6 ft');   // { ok: true, value: { value: { value: 6, unit: 'ft' }, approximate: true } }
height.parse('6 ft');         // approximate: false
```

- `approx(codec, options?)` is a wrapper whose value is `{ value: T; approximate: boolean }`, so the inner codec and its values are untouched, and only fields that want the distinction pay for it.
- Markers: `~`, `∼`, `≈`, `about`, `around`, `approx.`, `approximately`, `roughly`, `circa`, `ca.` before the value; `or so` and `-ish`/`ish` after it (`5 ft-ish`, `5ish`), or `-ish` on the number (`10-ish minutes`). At most one before and one after; anything else goes to the inner codec, which rejects it.
- Text without a marker parses as `approximate: false`. Formatting prefixes `~` when approximate (`~5 ft`). The id is `approx(<inner id>)`; the inner codec's alternatives are wrapped too.
- It composes over ranges: `approx(range(length()))` reads `about 5-7 ft`. `5+` isn't an approximation: it's an open range.

### Alternatives

An **alternative** is another reading of the text as typed: a whole value, not a guess at what the text might grow into (that's a completion; see [Completions](#completions)). Any codec can report them, on either branch:

```ts
postalCode().parse('90210');
// { ok: false, issues: [{ code: 'ambiguous', … }],
//   alternatives: [{ country: 'US', code: '90210' }, { country: 'DE', code: '90210' }, { country: 'FR', code: '90210' }] }
```

- **On success**, the codec chose and is saying what else it could have meant: merge's later codecs, or a codec's own second reading.
- **On failure**, with an `ambiguous` issue, the codec won't choose: the readings are equally good, and picking one would be a silent guess. The person chooses.
- **On failure with another issue**, an alternative is a correction the codec won't apply silently but can name: `coordinates` offers the swapped reading of a pair that's out of range in the field's order (`-74.006, 40.7128` in a lat,lng field). Choosing it is the person's call, as with `ambiguous`.
- **Choosing one** replaces `value` and keeps `raw`, on either branch: `raw` is still what was typed, and the alternative is a reading of it. It commits without parsing again, after the schema (which already ran on it at parse time; schemas are idempotent, so running it again is safe, and one path is simpler than tracking what was validated). The fields' `choose(value)` does it (a `choose` event in both machines); the reading it replaces becomes an alternative, so the choice can be undone. `pick` is different: it's for pickers, and sets `raw` to `format(value)`.
- Alternatives are values, so they go through the codec's `check` and schema like the value (see [Defining a codec](#defining-a-codec)), and they are a parse-time hint: never stored. A failed commit stores `{ raw, issues }`; choosing an alternative afterwards stores `{ raw, value }`.
- Alternatives are plain `T`s, JSON-safe and compared by fixtures. Candidates that are only labels until fetched are completions, which only external codecs have.
- A value the user's schema rejects comes back as `invalid` issues, still with the alternatives that passed.
- **Wrappers:** `merge` tags them (below); `approx` and `optional` wrap them; `range` and `defineRange` don't report their sides' alternatives, since a range already chooses between readings by its completion rules.

### Merging codecs

```ts
const heightOrWeight = merge([length(), mass()]);
```

- Takes an array of codecs. Earlier codecs win: the first whose `parse` succeeds provides the value. The order therefore also decides what bare input means.
- The result is tagged by `id`: `{ codec: 'length', value: … } | { codec: 'mass', value: … }`. `format` dispatches on the tag.
- **Alternatives are reported.** A successful `ParseResult` also carries `alternatives`, tagged: every other reading of the text, in codec order, where each member contributes its value (if it parsed) and then its own alternatives. So an `ambiguous` member's readings are offered even when another member wins. `1m` under `merge([length(), duration()])` returns length as `value` and duration in `alternatives`, so a UI can offer a chooser instead of guessing silently. See [Alternatives](#alternatives).
- **Failures report everything.** If every codec fails, the result carries all of their issues, in codec order, each with `codec` set to the id that reported it, and all of their alternatives, tagged, in the same order.
- Two codecs with the same `id` are a definition-time error.
- **Its `id` is derived**, so it is deterministic: `merge(length,mass)`, from the inner ids in order. Nested merges flatten: `merge([merge([a, b]), c])` is the same codec as `merge([a, b, c])`, and tags are always leaf ids. Custom ids can't contain parentheses or commas, so derived ids never collide with them.
- **Empty input** is one `empty` issue, not one per codec.
- **`context`** combines the contexts of the codecs that parsed: the locale, and `now` if any of them read the clock.
- **One clock per parse.** Without `ctx.now`, the first member to read the machine clock pins that reading: later members get it as `ctx.now`, so they all agree. `defineRange` does the same across both sides, so `today-tomorrow` can't straddle midnight. Completion doesn't read the clock at all (see Ranges).
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

A quantity codec is built from a unit table: a plain object mapping unit IDs to a conversion factor and aliases. There is no separate "dimension" concept; the codec carries its table. `quantity()`, from `quanto`, is a definition helper, not a codec: `@quantojs/common`'s quantity codecs are defined with it, exactly as users and agents define theirs:

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
- **`compare` uses a relative tolerance** of `1e-9` on base-unit values. Five feet and sixty inches differ by an ulp after conversion; without tolerance they would compare unequal. It orders values in the base unit: with a base where bigger means more, bigger compares greater. Like `convert`, it throws on a value with no finite base value (`0 L/100km`), which would otherwise compare equal to everything.
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
- **`number`** (on `quantity()`'s definition, not a user option) replaces how numbers are read and printed, for quantities with their own number syntax. It's `{ read(text, ctx, from), format(value, ctx) }`, with `read` returning `{ value, end }` like `readNumber`, in the unit's own terms, and `format` printing something `read` reads back. An optional `min` is the smallest value `format` can print; smaller values fail the structural check, so `format` never prints text `read` rejects. It's used for every number in the input, including compound input and the `missing_unit` example, and the codec exposes it as `codec.number` so range completion can find each side's number. `pace` is the built-in user (`5:30` is 330 seconds).
- **`canonicalUnit`** narrows the value type to that unit (`Quantity<'in'>`) and turns unit-aware constraints into plain number checks that any validator can express. It is the recommended way to validate quantities.
- Without `canonicalUnit`, cross-unit constraints are written as refinements that use quanto's math, e.g. `.refine((h) => compare(len, h, { value: 8, unit: 'ft' }) <= 0)`.
- **Compound input** (`5'11"`, `5 ft 11 in`, `1 lb 4 oz`, `2h30m`) is summed into the **smallest** unit mentioned (71 in, 20 oz, 150 min), or into `canonicalUnit` if set. The smallest unit usually gives an exact integer, and it's what `canonicalUnit` users expect.
  - Components go from larger to smaller units, without repeats; `11 in 5 ft` is unparseable. Only linear units compound.
  - Only the first component carries a sign, and it applies to the whole: `-5 ft 6 in` is -66 in. That includes a minus on a zero first component: `-0 ft 6 in` is -6 in.
  - A trailing bare number takes the previous unit's `subunit`; without one it's unparseable.
  - Parts can be joined by `,`, `and` or `&` (`5 feet, 11 inches`, `1 hour and 30 minutes`), but only after a part with a unit: `5 ft,` and `5, 11` are unparseable.
  - Conversions scale decimal factors to integers before dividing, so `5 ft 11 in` is exactly 71 in and 1 in is exactly 25.4 mm. Factors are taken as the decimals they're written as; when the scaled integers would pass 2^53 (`hp`'s 745.69987158227022), conversion falls back to plain division, accurate to float precision.
- **Magnitude suffixes**: the first number can carry `k`, `m` or `bn`, attached and case-insensitive (`2k ft`, `2M lbs`, `1.5k km`), or the words `thousand`, `million` or `billion` (`2 million ft`), which follow the same rules. `t` and `b` are left out: they're tonnes and bytes, and nobody types trillions of feet. The suffix's value is exact in decimal (`1.1k` is 1100).
  - **A unit follows**: it's a magnitude. This is never ambiguous, since a unit must be followed by a number, so `2m ft` can only be 2,000,000 ft.
  - **Bare** (`2k`, `2M`): if the letter is one of the codec's own aliases, the unit wins: `2M` in a length field is 2 meters, `2t` in mass is 2 tonnes, `2m` in duration is 2 minutes. Otherwise it's a magnitude of the `defaultUnit` (`2M` in a mass field defaulting to lb is 2,000,000 lb), and without one it's `missing_unit`.
  - A suffixed number can't start compound input (`2k ft 6 in` is unparseable), and later components never take a suffix.
  - Only the default number syntax reads suffixes; a codec with its own `number` (like `pace`) doesn't. Formatting never prints them.
- **`markers`** (on `quantity()`'s definition) are words that can follow a number without naming a unit, so it reads as a bare number. `temperature` uses them: `20°`, `20 deg` and `20 degrees` take the `defaultUnit`, and without one the definition's **`markerUnit`**, also keyed by measurement system: temperature's is `{ us: 'F', uk: 'C', metric: 'C' }`, so `451°` is °F in en-US and `20°` is °C in en-GB. A bare `70` stays `missing_unit`: the degree sign says it's a temperature, a bare number doesn't, so only the marker gets a regional default. Aliases take precedence (`20°C`, `20 degrees F`), and a marker that's also an alias is a definition-time error.
- **Unit matching**: the longest alias wins (`miles` before `mi` before `m`), aliases may contain spaces and `/` (`fl oz`, `km/h`), and a word alias can't run into a following letter (`5 ms` is not `5 m` + `s`). A period after a word alias is skipped (`5 ft. 11 in.`). A word that matches no alias, alone or after a slash (`70 kg` in a length field, `5:30 /yd` for pace), is `unknown_unit`; anything else left over is `unparseable`.
- Default formatting prints at most 2 fraction digits (`70.87 in`, `1.62×10⁶⁵ m`), or, for a non-zero value that would round to 0, enough for three significant digits (`0.000123 m`, since `0 L/100km` wouldn't parse back), then the unit's first alias, separated by a space unless the alias is `'`, `"`, `°`, `%`, `‰` or `‱` (`45°`, `30'`, `12.5%`).
- The quantity codecs in `@quantojs/common`: `length`, `mass`, `duration`, `temperature`, `volume`, `area`, `speed` (its own unit table, not derived), `dataSize`, `dataRate`, `compute`, `computeRate`, `energy`, `power`, `pressure`, `angle`, `frequency`, `fuelEconomy`, `pace`, `torque`, `force`, `acceleration`, `flowRate`, `density`, `voltage`, `current`, `resistance`, `capacitance`, `charge`, `luminousFlux`, `illuminance`, `luminance`, `radiationDose`, `absorbedDose`, `proportion` and `soundLevel`, each exported alongside its unit table (`lengthUnits`, …). It also has `number`, `percent`, `ratio` and `text`, and money and odds in their own subpaths. Dates are in their own package.
- `number` is a plain number with no unit: `1,234.5`, `twelve`, `6.02×10^23`, and the magnitudes `1.2k`, `3M`, `2bn`, `1.5t` (attached) or `3 million` (a word). An expression takes no magnitude (`2*3k` is unparseable). It formats like a quantity's number, to 2 fraction digits. Integers and bounds are the `schema`'s job.
- `percent` is a plain number in percentage points (`12.5`, not `0.125`): a bare number, one followed by `%`, `percent`, `per cent` or `pct`, or one after `%` (`%50`, as written in Turkish). A bare fraction (`3/4`) is unparseable, since it could mean 75% or 0.75%; `3/4%` is fine. Basis points, per mille and parts per million are `proportion`, and ratios are `ratio`.
- `proportion` is a quantity codec, so unlike `percent` it keeps the unit: `25 bps` is `{ value: 25, unit: 'bp' }` and converts to 0.25%. Its units are `%`, `‰`, `bp` (also `‱`), `ppm` and `ppb`, against the whole. `ppt` is left out: it means both parts per thousand and per trillion. A bare number is `missing_unit`, as with any quantity.
- `ratio` is two or more non-negative numbers, stored as written (`16:9` is `[16, 9]`, not reduced and not divided out). Colons take any number of terms (`1:2:4`); `to`, `in`, `out of` and `/` take exactly two (`3 in 10`, `3/4`). Formats with colons. It records the terms, not what they mean: `3 in 10` is `[3, 10]`, a part of a whole, and formats as `3:10`. Odds, which have a direction and a probability behind them, are `@quantojs/common/odds`.
- `text` is the identity codec: the value is the trimmed string as typed, with no other parsing. Blank is an `empty` issue, as everywhere; `optional(text())` allows it, and `schema` validates. It's what a field with no codec uses.
- `duration` covers fixed-length units only (ms through weeks). Calendar durations (months, years) are not quantities because they have no fixed length.
- `duration` reads clock notation as compound input, so it sums exactly: `1:30:15` is always h:mm:ss (5415 s). Two parts depend on what follows: `1:30 h` is h:mm (90 min), `1:30 min` is m:ss (90 s), and a fraction means seconds (`1:30.5` is 90.5 s). Bare `1:30` follows the `clock` option, `'h:mm'` (the default; meeting lengths, cook times) or `'m:ss'` (lap times). Minutes and seconds must be two digits under 60, and clock notation followed by any other unit is unparseable.
- `length` has no `nm`: it's nanometers in one field and nautical miles in another, so nautical miles are `nmi`. It has the Planck length (`ℓₚ`, `lP`, `planck length`), for fun; NFKC reads `ℓₚ` as `lp`. And the light year (`ly`, `light year`), the IAU's exact 9,460,730,472,580,800 m, for scale at the other end. `mass` reads `#` as pounds (`150#`). `volume` reads `cc` and `cm³` as milliliters.
- `mass` has no `ton`: it means different masses in US, UK and metric use (`t`/`tonne` is the metric ton). `volume`'s customary units are US measures; UK imperial pints and gallons need a custom table.
- `dataSize` is bytes only: `KB`, `MB`, … are decimal (1000) and `KiB`, `MiB`, … binary (1024). With no bit units, a lowercase `b` means bytes too (`100b`, `Mb`). `dataRate` has both: bit and byte aliases that differ only by case match exactly, all-lowercase `mbps`, `kbps` and `gbps` are listed as bits, and `mb/s` is ambiguous and rejected.
- `compute` counts floating-point operations (`FLOP`, `kFLOP`, … `YFLOP`, and `pfsDay`, a petaflop/s for a day) and `computeRate` measures their speed (`FLOPS`, … `YFLOPS`). People write `FLOPs` and `FLOPS` for both, so each codec reads them as its own kind; `/s` is what's unambiguous, and only `computeRate` accepts it. A plain `TFLOP` or `teraflop` in a `computeRate` field is `unknown_unit`. Neither has milli- units, so `mflops` is mega-.
- Units that differ only by case are both in the table where both are real, so each matches exactly as written: `force`'s `mN` and `MN`, `voltage`'s `mV` and `MV`, `resistance`'s `mΩ` and `MΩ`. Where only one exists (`mA`, `mF`, `mSv`), any case means it. Micro is `µ` or `u` (`µF`, `uF`); `Ω` is the ohm, in either code point.
- **Scales.** A unit can name a `scale`; units convert only within their scale, each scale against its own base, and units with no `scale` share one, as in most tables. It's for units of one quantity that are both legitimate readings yet don't convert: weighted sound levels, and later things like `mg/dL` and `mmol/L`, which need the substance. Across scales, `convert` and `compare` throw (a programmer error, like a unit outside the table); parsing into a `canonicalUnit` on another scale is an `incompatible_unit` issue; compound input must stay on one scale; and a range's ends must be on one scale (`80 dB-90 dBA` is `incompatible_unit`, and fails the range's structural check). A `subunit` must be on its unit's scale, checked at definition time.
- `soundLevel` is sound pressure level in decibels (dB SPL), with weighted readings on their own scales: `dBA` (`dB(A)`) and `dBC`. A-weighting depends on frequency, so 85 dB(A) says nothing exact about the unweighted level. Pascals are on the unweighted scale as a function unit (94 dB is about 1 Pa). Gain and other relative decibels (`dBm`, `dBV`) aren't sound levels and aren't here.
- `torque` reads pound-feet either way round (`lb-ft`, `ft-lb`), as people write them. `acceleration`'s `g` is standard gravity. `flowRate` and `density` use US gallons, as `volume` does. `charge` holds battery capacity (`mAh`, `Ah`); watt hours are `energy`. Light is three quantities: `luminousFlux` (lumens, a bulb's output), `illuminance` (lux, light on a surface) and `luminance` (nits, a screen's brightness). Radiation is two: `radiationDose` (sieverts and rem, the dose to a person) and `absorbedDose` (grays and rad); they don't convert, so they're separate codecs.
- `energy`'s `cal`, `Cal` and `calories` are kilocalories, as on food labels; the small calorie isn't included. `power` has both `mW` and `MW`, matched exactly. `pressure` and `frequency` have no milli- units, so `mpa` and `mhz` mean mega-. `frequency` has `rpm` but not beats per minute, which nobody converts to hertz.
- `angle` uses arcseconds as its base, so `40°26'46"` compounds exactly (degrees take arcminutes as their subunit, arcminutes take arcseconds).
- `fuelEconomy` has km/L as its base; L/100km is a function unit. `mpg` is US; UK mpg is `mpg (imp)`, as with `volume`.
- `pace` is a `quantity()` with its own number syntax: it reads clock notation (`5:30 /km`, `1:05:00 /mi`) as seconds and a plain number (`5.5 min/km`) as minutes, and formats to a tenth of a second. Its unit table is seconds per km and per mile, with the minutes word folded into the aliases (`min/km`, `minutes per mile`). A negative pace is rejected when typed, and clock notation has no negative form, so a stored negative fails the structural check (its syntax has `min: 0`): `schema` rejects it and `format` throws, rather than printing `-6:-30 /km`.

## Money

Money lives in **`@quantojs/common/money`**: the `money` codec, the `Money` type, its operations, `moneyRange` and `intlMoney`. It's in `@quantojs/common` because it's complete: the value shape, the currency table, the ambiguity rules, the operations and the range rules are settled, and its data changes (a country adopting the euro) are rare, additive refreshes. It has its own subpath because it has its own types and operations. Its region data (each region's currency and where it writes the symbol) is generated by its own script, `scripts/generate-money-data.ts`.

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
- A JS number holds integers exactly up to 2^53 (~$90 trillion in cents), which is enough. `bigint` is used only for exact internal arithmetic; public values stay JSON-safe numbers.
- The field name `minorUnits` is deliberately explicit, so nobody mistakes 1234 for $1234.

### Operations

Opt-in, in their own subpath, with the same status as quantity operations. Unlike quantities, money keeps its arithmetic: the currency and safe-integer checks, rounding modes and loss-free splitting are exactly what apps get wrong on their own, and money has no affine or non-linear cases to rule on.

```ts
import { add, subtract, compare, scale, allocate, convert } from '@quantojs/common/money';
```

- `add`, `subtract` and `compare` require the same currency. Mismatches always throw at runtime, and are also a type error when both currencies are literal types (`Money<'USD'>` vs `Money<'EUR'>`). Values typed as plain `Money` are only checked at runtime.
- `scale(m, factor, { rounding })` and `convert(m, 'EUR', { rate, rounding })` always round to a whole minor unit of the result currency. The caller must choose the rounding mode, because the right one depends on the domain (tax, invoicing, display). Modes use `Intl.NumberFormat`'s `roundingMode` names (`halfExpand`, `halfEven`, `trunc`, …).
- `convert`'s `rate` is how many major units of the target currency one major unit of the source buys. Differing minor units (USD → JPY) are handled. quanto never fetches rates.
- `allocate(m, ratios)` splits without losing a cent (e.g. $10 three ways → 334 / 333 / 333): each share gets its rounded-down part, and the remainder goes one minor unit at a time to shares with non-zero ratios, in order.
- Factors, rates and ratios are interpreted as their shortest decimal representations. Arithmetic uses exact integer fractions internally and rounds once, so `scale` treats `1005 × 1.1` as exactly 1105.5 without losing safe-integer digits. A computed factor such as `0.1 + 0.2` means the decimal `0.30000000000000004`; quanto does not infer a different intended factor.
- `scale` and `convert` round to a whole minor unit only; the operations never produce fractional minor units.

### Parsing

The codec is `money({ defaultCurrency?, schema?, format? })`.

- Accepts `$12`, `12 USD`, `USD 12`, `€12,50`, `12.50 eur`, `$1.2k`, `$3M`, `$1.5bn`, and names (`12 dollars`, `12 bucks`, `12 euros`, `12 quid`, `500 yen`). Suffixes (`k`, `m`, `b`/`bn`, `t`) are case-insensitive and attached to the number: `3m` and `3M` both mean million in a money field.
- Magnitude words follow the number: `thousand`, `grand`, `million`, `mil`, `mn`, `mm` (finance's million, attached or not), `billion` and `trillion` (`$12 million`, `12 grand`, `$12mm`). Once only, and not after a suffix (`$12k grand` is unparseable).
- Minor units: `50¢`, `50c`, `50 cents`, `5p`, `50 pence`. Cents resolve like `$` (dollars with cents, plus the euro), so `50 cents` is USD by default, CAD in en-CA and EUR in en-IE; pence are GBP. A minor unit stands alone, with no symbol or code (`$50¢` is unparseable), and has no decimals.
- Accounting negatives: `($12)` is -$12.
- Amounts in words (`twenty dollars`, `five hundred bucks`, `half a million dollars`), and cents after an amount: `five dollars and fifty cents`, `$5 and 50 cents`, `ten pounds five pence`. The cents must be a whole number under 100 of the same currency's minor unit. The inside can't have its own sign (`(-$12)` is unparseable).
- A currency can be written before the number, after it, or both, if they agree: `$12 CAD` is CAD, `€12 USD` is unparseable. Disambiguated symbols are accepted (`US$`, `C$`, `CA$`, `A$`, `NZ$`, `HK$`, `R$`, `CN¥`…).
- A sign goes before the symbol or the number (`-$12`, `$-12`), not both.
- A bare number takes `defaultCurrency`; without it, it's a `missing_currency` issue.
- A three-letter word that isn't an ISO 4217 code, or any other word in a currency position, is `unknown_currency`.
- Ambiguous symbols (`$` is used by USD, CAD, AUD, MXN…; `kr` by SEK, NOK, DKK, ISK; `¥` by JPY and CNY) resolve to the codec's `defaultCurrency` if that currency uses the symbol, then to `ctx.locale`'s currency if it does (`$` in en-CA → CAD, `$` in de-DE → USD), then to the symbol's first currency (USD, SEK, JPY).
- Parsing retains the written digits until exact minor units are computed; formatting inserts the decimal point into minor-unit digits without converting to a floating-point major amount. Every safe-integer amount round-trips exactly.
- Input with more precision than the currency allows (`$3.459`) is an `excess_precision` issue. Sub-minor-unit prices are deferred (see below).

## Odds

Betting odds live in **`@quantojs/common/odds`**: the `odds` codec, the `Odds` type and its operations. They're in `@quantojs/common` because the notations and the arithmetic are settled. They have their own subpath, like money, because they have their own value type and operations. Odds aren't a `ratio`: they have a direction (against, unless `on`), three notations for one value, and an implied probability.

### Values

```ts
type Odds =
  | { kind: 'fractional'; numerator: number; denominator: number }  // 11/4, against
  | { kind: 'decimal'; value: number }                              // 3.75, above 1
  | { kind: 'american'; value: number };                            // +275, -200; |value| >= 100
```

- The value keeps the notation it was typed in, so it formats as typed. Fractional odds are whole numbers kept as written, not reduced: bookmakers quote conventional fractions (`100/30`, `6/4`), which a decimal can't give back. `canonicalKind` stores every value in one notation.
- The structural check: whole positive numerator and denominator, decimal above 1, American at least 100 either way (and the `canonicalKind`, if set).

### Parsing

- **Fractional:** `5/1`, `5-1`, `5:1`, `5 to 1`, optionally `against`; `on` reverses it (`2/1 on` is `1/2`); `evens`, `evs` and `even money` are `1/1`. Both numbers are whole and above 0 (`2.5/1` and `5/0` are unparseable).
- **American:** a signed number, `+500`, `-110`, at least 100 either way (`+50` is unparseable).
- **Decimal:** an unsigned number above 1 (`6.0`, `3,75` in German). `1.0` and below is unparseable: it would return only the stake.
- **A bare whole number of 100 or more** (`150`) is `ambiguous`, with the American and decimal readings as alternatives (in that order: decimal odds that long are rare). A decimal point says decimal (`150.0`). In a field with `canonicalKind: 'american'` or `'decimal'`, it's read in that notation.
- **Implied probability:** `25%`, `25 percent`, between 0 and 100 exclusive, stored as decimal (`4`). There's no probability notation to store, since odds fields show prices.
- **A trailing `odds`** (`5/1 odds`, `+275 odds`, `70 odds`) is allowed after any of them. It isn't a unit and isn't stored: it says the text is odds, so in a merge, where `11/4` is a date, `+275` a number and `16:9` a ratio, those codecs fail on it and odds reads it.
- Left out: the Hong Kong, Malay and Indonesian notations, statistical odds (`1:4 in favour`; use `ratio`), and odds ratios (a `number`).

### Formatting

In the value's notation: `11/4`, `3.75` (always two decimals, as quoted), `+275` and `-200` (grouped like any number, `+1,000`). All read back.

### Operations

- `toDecimal(odds)`: the total return per unit staked, the notation everything converts through.
- `impliedProbability(odds)`: 1 / decimal, ignoring the bookmaker's margin.
- `convert(odds, kind)` and `fromDecimal(decimal, kind)`: into another notation. Fractional results are reduced, recovered by continued fractions with a denominator up to 10,000, so 4/3 decimal is `1/3`, not a 16-digit fraction. American results are rounded to 9 decimal places, to drop float noise.
- `compare(a, b)`: by decimal value, across notations, with a relative tolerance of 1e-9; -1 when `a` is the shorter price.
- Malformed odds throw, as in `@quantojs/common/money`.

## Dates and times

Dates and times live in **`@quantojs/datetime`**: the four codecs, their grammar, `dateRange` and the `Intl` date formatters. Its grammar is the most heuristic part of quanto and the likeliest to change, so it versions on its own. The core keeps what's shared, `ctx.now()` and `context.now`; the package owns its locale data (month and weekday names, numeric date order, 12- or 24-hour clock), generated by its own script.

Values are ISO 8601 strings. They're JSON-native and parse losslessly into Temporal (`PlainDate`, `PlainTime`, `PlainDateTime`, `Instant`) if an app needs date math. quanto does no date math. A future separate package may provide it, built on Temporal.

| Codec | Value | Example |
|---|---|---|
| `date()` | calendar date | `'2026-10-02'` |
| `time()` | wall-clock time | `'15:00:00'` |
| `localDateTime()` | date and time, no offset | `'2026-10-02T15:00:00'` |
| `dateTime()` | exact moment, with the UTC offset it was entered in | `'2026-10-02T15:00:00-04:00'` |

- **Times are always `HH:MM:SS`**, with no fractional seconds, in every codec. Equal values are therefore equal strings, and `3pm` parses to `15:00:00`.
- **No time zones in the first-party codecs.** `dateTime()` stores a UTC offset, not an IANA zone. An offset is exact and needs no tz database. Input with an explicit offset or `Z` keeps it; input without one takes the offset of `ctx.now`, which defaults to the machine's local offset. The limitation is DST: `3pm next month` gets today's offset. Apps that need real zones write a custom codec on Temporal.
- `date()`, `time()` and `localDateTime()` values sort lexicographically. `dateTime()` values with different offsets don't; compare them as instants.
- **Only `dateTime()` values are safe with `new Date()`.** `Date` reads date-only strings as UTC and offset-less date-times as local time, and rejects bare times. Use Temporal or plain string handling for the other forms.
- **Relative input** (`tomorrow`, `next fri`, `in 3 days`) is computed from `ctx.now`. Its offset defines the local calendar in which "tomorrow" is computed. When `now` is missing, the machine's clock and local offset are used and reported in `context.now`. In a browser that's what the user means. A server parsing on a user's behalf should pass the user's `now`, because the server's offset is usually wrong for them.
- Because the parsed value is captured at entry time and stored, relative input is never re-parsed later (see the stored envelope below).
- Numeric dates follow the region's date order. `03/04/2026` is March 4 in en-US (the default) and 3 April in en-GB and en-AU. Unambiguous forms (`2026-03-04`, `4 Mar`, `13/04`) are accepted in any locale.
- **Yearless dates** (`4 Mar`, `13/04`) take the year of `ctx.now`, with the same machine default.
- **Month and weekday names: English is built in; other languages are opt-in data.** Each of `date()`, `localDateTime()` and `dateTime()` takes a `names` option: `date({ names: [de] })`. `@quantojs/datetime/names` exports name sets for Spanish, French, German, Italian, Portuguese and Dutch (`es`, `fr`, `de`, `it`, `pt`, `nl`), generated from ICU at development time; any other language is just a `Names` object (twelve months and seven weekdays, each a list of accepted forms, plus optional filler words).
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

## Addresses

Mailing addresses live in **`@quantojs/libpostal`**, an external codec over [libpostal](https://github.com/openvenues/libpostal), the open-source address parser: a statistical model (a conditional random field) trained on over a billion addresses from OpenStreetMap and OpenAddresses, covering most countries, CPU-only and fast (10–30k addresses a second per thread). Splitting an address into its parts is a statistical problem with no common case across countries, so it can't be a built-in sync codec; libpostal is the best owned option, and the package's name says that's what it's built on.

```ts
import { address } from '@quantojs/libpostal';
import postal from 'node-postal';

const field = address({ libpostal: async (text) => postal.parser.parse_address(text), defaultCountry: 'US' });
await field.parse('1600 amphitheatre pkwy, mountain view, california 94043');
// { lines: ['1600 amphitheatre pkwy'], locality: 'mountain view', region: 'CA', postalCode: '94043', country: 'US' }
```

- **The app runs libpostal.** Its model is about 2 GB, so it's never a dependency: the `libpostal` option is a function from text to libpostal's `[{ label, value }]`, whether that's node-postal in-process or a request to a libpostal service (`pelias/libpostal-service`). The package has no runtime dependencies, and its fixtures run against a stub of libpostal's answers.
- **The value** is `Address`: `lines` (building, street, unit, PO box, in the order written; at least one), and optionally `dependentLocality`, `locality`, `region`, `postalCode` and `country` (ISO 3166-1 alpha-2). Absent parts are absent.
- **Text stays as typed.** libpostal lowercases its output; the codec finds each part in the text and keeps it as written. It doesn't title-case: `mcdonald` might be `McDonald`, and guessing would change what was typed.
- **Normalized where there's a convention:** regions to codes in the US, Canada and Australia (`California`, `Québec` → `CA`, `QC`), postal codes to their country's format where it has a fixed one (`sw1a2aa` → `SW1A 2AA`, `101180110` → `10118-0110`; others as typed, uppercased), and countries, written in any of the bundled languages or common aliases (`Deutschland`, `UK`, `USA`), to their codes.
- **`defaultCountry`** is the country of addresses that don't name one. It's an option, not read from the locale: the locale says how someone writes, not where the address is. Formatting leaves the default country out and names any other, in the reader's language.
- **Issues:** `unparseable` when there's no street line, no city or postal code, or a country it can't identify.
- **Formatting** is one line in the country's order: `1600 Amphitheatre Pkwy, Mountain View, CA 94043` (city, region, postcode), `Hauptstraße 5, 10115 Berlin, Germany` (postcode first, most of Europe), `10 Downing St, London SW1A 2AA, United Kingdom` (city, postcode). It reads back through libpostal.
- **Not included:** checking that an address exists (that needs a postal database) and completions (an address index, such as Pelias or Photon over OpenAddresses). A geocoding API covers both; wiring one up is an app's own external codec, and the value shape can be the same.

## Music

Pitches and time signatures live in **`@quantojs/music`**. Note naming varies by country and tradition, and the grammar will grow (tempo, intervals), so it versions on its own. Chords are out of scope: they aren't quantities.

### Pitch

`pitch()` is a quantity in two units: `note`, a MIDI note number (A4 is 69, middle C is 60) with cents as the fraction (`A4 +15¢` is 69.15), and `Hz`. The codec carries its unit table (`pitchUnits(a4)`, Hz as the base and `note` as a function unit), so `convert` and `compare` work, and `canonicalUnit: 'Hz'` makes `A4` 440 Hz.

- **Notes:** a letter, at most one accidental, an octave and optional signed cents: `A4`, `C♯5`, `Db4`, `B♭3`, `C##4`/`Cx4`/`C𝄪4`, `D𝄫4`, `C♮4`, `C sharp 4`, `B-flat 3`, `A4 +15¢`, `A4 -20 cents`. Octaves can be negative (`C-1` is 0). Letters are case-insensitive, so `bb3` is B♭3.
- **Frequencies and MIDI numbers:** `440 Hz`, `1 kHz` (stored as 1000 Hz), `four hundred forty hertz`, `MIDI 60`. A bare number is `missing_unit` unless the codec has a `defaultUnit`. A frequency must be more than 0 Hz.
- **Octave:** required. `F#` is `unparseable` ("Add an octave") unless the codec has a `defaultOctave`. `middleC: 3` switches to the numbering where middle C is C3 (Yamaha, and French usage).
- **Tuning:** `a4` (default 440) sets A4's frequency for conversions.
- **German and Nordic names** (de, da, nb, nn, no, sv, fi, et, pl, cs, sk, hu, sl, hr, sr): `H` is B and a bare `B` is B♭, with `-is` and `-es` accidentals: `Fis`, `Cis`, `Es`, `As`, `Des`, `Ces`, `Gisis`, `Heses`. The `-is`/`-es` names read in every locale; only the bare `B` depends on the locale (`B4` is 70 in de-DE and 71 in en-US). `B` with a symbol is the English B (`B♭4`, `B#4`), and `H` reads as B everywhere.
- **Solfège** reads in every locale: `Do`/`Ut`, `Ré`/`Re`, `Mi`, `Fa`/`Fá`, `Sol`/`So`, `La`/`Lá`, `Si`/`Ti`, with symbol accidentals (`Sib3`, `Fa#4`) or words (`Fa dièse 4`, `Si bémol 3`, `diesis`/`bemolle`, `sostenido`/`bemol`, `sustenido`).
- **Formatting** prints the nearest note and the remaining cents to a tenth (`A4 +15¢`, `A♯4 -50¢`), or the frequency to two decimals (`261.63 Hz`). Names follow `ctx.locale`'s language: `B♭4` in English, `B4` (B♭) and `H4` in German, `Si♭4` in French, `Fá4` in Portuguese. Accidentals print as `♯ ♭ 𝄪 𝄫`.
- **Spelling follows `ctx.music.key`** (see [Extensions](#defining-a-codec)). A key is a tonic and a mode (`F major`, `Eb`, `F# minor`, `Dm`, `C dorian`; all seven modes). The key's own notes are spelled as the key spells them (E♯ in F♯ major, C♭ in G♭ major); other notes take sharps in keys whose signature is sharp or empty, and flats in flat keys. Minor keys also spell their raised sixth and seventh (C♯ in D minor, not D♭). Without a key, notes take sharps. The key only affects `format`: a note parses to the pitch it names, whatever the key. A malformed key throws, since it comes from the app.
- **Merging and ranges.** Note names overlap other codecs (`A4` is a paper size, `B` is bytes); in a `merge`, the order decides, as usual. `defineRange(pitch())` reads vocal and instrument ranges (`C3-C5`, `E2 to G#4`).

### Time signatures

`timeSignature()` values are `{ numerator, denominator }`, with `groups` for additive meters: `3+2+2/8` is `{ numerator: 7, denominator: 8, groups: [3, 2, 2] }`.

- Accepted: `4/4`, `6/8`, `6 / 8`, `3/4 time`, `¾` and `⁶⁄₈` (through `normalize`), `C`, `common time` and `𝄴` (4/4), and `cut time`, `alla breve` and `𝄵` (2/2). Additive meters can be parenthesized: `(3+2+2)/8`.
- The bottom number is a note value: 1, 2, 4, 8, 16, 32 or 64. Irrational meters (`4/3`) are `unparseable`, as are zero, negative and fractional counts.
- `format` prints `6/8` or `3+2+2/8`. Common time prints as `4/4`, since the value doesn't record the symbol.
- It's its own codec rather than a fraction: a time signature never reduces (`6/8` isn't `3/4`).

## Phone numbers

Phone numbers live in **`@quantojs/libphonenumber`**, a sync codec over [libphonenumber-js](https://gitlab.com/catamphetamine/libphonenumber-js), the JavaScript port of Google's libphonenumber. Which numbers are valid follows numbering plans, which change, and the library's metadata changes with them, so it versions on its own; the name says what it's built on, as `@quantojs/libpostal`'s does.

- **`phoneNumber()`**: the value is an E.164 string (`'+14155552671'`), with an extension as RFC 3966's `;ext=` suffix (`'+14155552671;ext=123'`). A string, because E.164 is the standard storage form and needs no wrapper.
- **National numbers** are read in `defaultCountry` (ISO 3166-1 alpha-2), else the locale's region, as `money` reads `$`. So `(415) 555-2671` is a US number in en-US and a German one in de-DE. `+`, `00` (where the country's own prefix is another) and the country's international prefix need no country. `tel:` URIs and extensions (`ext. 123`, `x123`, `#123`) are read; other words and vanity letters are `unparseable`.
- **Valid at parse, possible when stored.** Parsing requires a valid number per the metadata (an allocated range, not just the right length). The structural check requires only a possible one, so a number stored under one release still passes `schema` and formats under the next.
- **Formatting** is international (`+1 415 555 2671`), or with `style: 'national'`, the country's own form (`(415) 555-2671`) for numbers that read back in the field's country; others keep their country code, so formatted text always reads back.
- Issues are `unparseable`, with messages that say why (not valid in the country, unknown country code, wrong length). Uses the `min` metadata; telling mobile numbers from landlines needs the larger `max` metadata and is deferred.

## Coordinates

Coordinates live in **`@quantojs/geo`**. Latitude and longitude are settled, but the notations will grow (UTM, MGRS), so it versions on its own. Coordinates aren't `dimensions`: the two parts have roles and ranges, and hemispheres act as signs.

- **`coordinates()`**: the value is `{ lat, lng }` in decimal degrees (WGS 84), lat in [-90, 90], lng in [-180, 180].
- **Notations:** decimal degrees; hemisphere letters or words before or after each part (`40.7128° N`, `N40.7128`); labels (`lat`, `lng`, `lon`, `latitude`, …); degrees, minutes and seconds (`40°42'46" N`) and degrees and decimal minutes (`40°42.767' N`), with minutes and seconds under 60; and full plus codes (`849VCWC8+R9`), read as the center of their area. Short plus codes need a reference location and are `unparseable`. With letters or labels the parts come in either order; a sign that contradicts its letter is `unparseable`.
- **Order:** a bare pair is latitude first, as people write it and map apps copy it; `order: 'lngLat'` reads GeoJSON's order. A pair out of range in the field's order is `unparseable`, never swapped silently, and when the swapped reading is in range it's offered as an alternative (see [Alternatives](#alternatives)).
- **Separators:** a comma, a semicolon or a space. A point is always a decimal point. A comma between digits is a decimal comma where the locale writes decimals with one (`40,7128; -74,0060` in de-DE) and a separator elsewhere, so a copied `40.7128, -74.0060` reads in every locale. Numbers are read by the codec's own lexer, not `readNumber`, since grouping separators and words would collide with the pair separator.
- **Geohashes** are opt-in (`geohash: true`): ordinary words can be geohashes (`denver`). At least 5 characters, with a letter; text that reads both as coordinates and as a geohash is `ambiguous`.
- **Formatting:** decimal degrees to 6 places (about 0.1 m) with hemisphere letters, in the field's order: `40.7128° N, 74.006° W`. `degreesMinutesSeconds`, `degreesDecimalMinutes`, `plusCode` and `geohash` are formatters for the `format` option.
- **Operations:** `toPlusCode`, `toGeohash` and `distance` (great-circle, in meters, on a sphere of the mean Earth radius, 6,371,008.8 m).

## Sizes

Ring and shoe sizes live in **`@quantojs/sizes`**: regional numbering systems over a physical length, with conversions that are partly chart-dependent and other categories to come, so it versions on its own. Clothing sizes are left out: they vary by brand and letter sizes don't convert.

- **Sizes are quantities:** each system is a unit over a base length, with linear or affine conversions, and the codecs expose `units`, so `convert` and `compare` from `quanto/quantity` work. They're custom codecs rather than `quantity()`, since sizes are written system first (`US 7`, `UK N`) and UK ring sizes are letters. `nearestSize(codec, size, unit)` rounds a conversion to the target system's standard steps.
- **`ringSize()`**, over the inner circumference in mm, every system exact by definition: `us` (US and Canada), `uk` (letters with halves, `Z+1` on; stored as the letter's place, A = 1), `eu` (ISO 8653: the circumference), `ch` (the circumference less 40) and `diameter`. Letters always mean UK. `54 mm` is the circumference, with the diameter as an alternative. Japanese sizes have no defining formula and are left out.
- **`shoeSize()`**, adult sizes over the foot length: `usMen`, `usWomen`, `uk`, `eu` (Paris points), `mm` (Mondopoint) and `cm`. A US size needs its fit, written (`men's 10`, `US W 8`; `M`/`W` only before the number, since after it they're widths) or from the `fit` option; otherwise it's `ambiguous`. Conversions follow the sizing formulas (each system on the last, two size steps of allowance to the foot), not a retail chart, so US men's 10 is UK 9 and EU 42.6, where most charts say EU 44. The formulas are defined rather than chosen from one brand, which makes them the better default; an app that wants a retailer's chart supplies it in its own `format`. Kids' sizes and widths are `unknown_unit`.
- **Bare numbers** need a `defaultUnit`, which can follow the measurement system (`{ us: 'usMen', uk: 'uk', metric: 'eu' }`). The system is never inferred from the number.

## Anything

**`@quantojs/anything`** is one codec that reads anything the first-party packages can: `anything()`. It's the site's big field, as a package. It sits on top of the codec packages rather than being one of them, so it's the one package that depends on the others (`@quantojs/common`, `@quantojs/datetime`, `@quantojs/geo`, `@quantojs/music`, `@quantojs/sizes`), and its order changes as codecs are added, so it versions on its own.

- **It's a `merge`, in `approx`:** dates and times; `dimensions(length())`; length, mass, duration and temperature; money; pitch; the other quantities; coordinates; ring and shoe sizes; then the catch-alls, plain numbers, ratios and odds; then ranges of every quantity, date, time and amount of money. The value is `Approx<Tagged<unknown>>`: switch on `value.codec`.
- **The order settles every conflict,** since the first codec that reads the text wins and the others' readings are its alternatives: `24 × 36 in` is dimensions, since length reads `×` between numbers as a product; `ft` is feet before it's the forint; `455hz` is a pitch, not a frequency; `g` is grams, not standard gravity; `C` and `F` are temperatures; `rad` is an angle; `989 TFLOPS` is a rate; `11/4` is a date; `25 bps` is a data rate; `US 10` is a ring size; `70` and `+275` are numbers, not odds. The fixtures pin each one.
- **Failures are tidied:** forty quantities say they don't know `bananas`, so the issues are the first of each informative code, in codec order, or one `unparseable` when nothing had more to say.
- **`include`** adds codecs after the built-in singles and before the catch-alls, so `4155552671` reaches a phone codec before `number`. Phone numbers come this way rather than built in: libphonenumber-js's metadata is about 80 kB, and an app may want to load it later. `phoneNumber` is re-exported for convenience from a subpath, `@quantojs/anything/phone`, not the main entry: a re-export there would put the metadata in every bundle whose bundler keeps unused re-exports of a module that's also imported dynamically (Bun's code splitting does). An app that loads it lazily imports the subpath dynamically and rebuilds the codec when it arrives.
- **`names`** passes month and weekday names to the date codecs. Formats are the members' defaults; `format` replaces them, as on any codec.
- Not included: addresses (`@quantojs/libpostal` is external, and `merge` takes sync codecs), percent (`proportion` reads `%`), text (it reads everything) and time signatures (`6/8` is a date).

## Locales

`ctx.locale` drives parsing, not just formatting. It's a BCP 47 tag; when it's missing, assume en-US.

Bundled data is keyed at its natural level, and each level resolves on its own. A locale is never swapped wholesale for a different one because its language lacks data: `en-AU` must not become `en-US` and read `03/04` as March 4.

The core resolves a tag to a **language and region**, and owns the data every codec needs. Each domain owns its own data (money's currencies, dates' orders and names), keyed the same way and looked up with `lookupRegional`, so adding a language's month names is a `@quantojs/datetime` release that doesn't touch the core (and, being opt-in, doesn't change any existing field).

| Data | Owned by | Keyed by | Coverage |
|---|---|---|---|
| Decimal and grouping separators, grouping pattern | `quanto` | region, with language exceptions (`fr-CA`, `de-CH`, …) | Every region |
| Measurement system (`us`, `uk`, `metric`) | `quanto` | region: US → `us`, GB → `uk`, everything else → `metric` | Every region |
| Likely region of a language | `quanto` | language | About 90 languages |
| Currency | `@quantojs/common/money` | region | Every region |
| Currency symbol position (before or after the amount) | `@quantojs/common/money` | region, with language exceptions | Every region |
| Numeric date order (MDY, DMY, YMD) | `@quantojs/datetime` | region, with language exceptions | Every region |
| Hour cycle (12- or 24-hour clock) | `@quantojs/datetime` | region, with language exceptions | Every region |
| Numbers in words | `quanto` | language | English built in; other languages are opt-in grammars passed in `ctx.grammars`. |
| Month and weekday names | `@quantojs/datetime` | language | English built in; `es`, `fr`, `de`, `it`, `pt`, `nl` exported as opt-in name sets, passed with the codecs' `names` option. |

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
- Thousands grouping must be consistent: every group three digits, or the Indian grouping by two (`1,50,000`), which is accepted in every locale since it has no other reading.
- Space grouping (`1 000 000`) is accepted in every locale; it's unambiguous. Apostrophe grouping (`1'000`) only where the locale groups with it, and in money, where there are no feet to confuse it with (`CHF 1'234.50`).
- A mixed fraction can be written with a hyphen, as in US building trades (`5-1/2 in`), and a whole number can end with a period (`5. ft`).
- Other accepted forms: fractions (`1/2`, `5½`), exponents (`1e3`), suffixes (`1.2k`, `3M`) where the codec allows them.
- **Numbers in words**, for dictation as much as typing, through [grammars](#grammars). The built-in English grammar reads one well-formed number, strictly:
  - Cardinals: `zero`–`nineteen`, tens and their compounds (`twenty-five`, `twenty five`), `hundred` with an optional British `and` (`one hundred and five`, `a hundred`), hundreds of 11–99 (`fifteen hundred`), and `thousand`, `million`, `billion`, `trillion` in decreasing order (`three hundred thousand and five`).
  - Decimals with `point` and one digit word per place (`one point two five`, `point five`), signs (`minus five`, `negative two`), and a scale after a decimal or fraction (`one point five million`, `half a million`).
  - Fractions: `half`, `third`, `quarter`, `fourth`, `fifth`, `eighth`, `sixteenth` and their plurals, with a numerator, spaced or hyphenated (`three quarters`, `three-quarters`, `five sixteenths`), an article (`a third`), or alone (`half`), and `of`/`a`/`an` after them (`three quarters of an inch`, `half a mile`); mixed with `and` (`two and three quarters`).
  - `a`/`an` as one before a word that isn't a number (`a mile`, `an hour`), and `and a half`/`and a quarter` after a single quantity (`an hour and a half`).
  - Rejected rather than guessed: two numbers in a row (`two fifty`, `nineteen eighty four`, `five eleven`), scales out of order (`two million thousand`), a bare `hundred`, homophones (`to`, `too`, `for` aren't numbers; dictation already chooses), `oh` for zero, and ordinals (`second` stays a unit of time).
  - Where words meet existing syntax: `and` is inside a number only after `hundred` or a scale and before a smaller number, or before a fraction; elsewhere it joins compound input (`five feet and eleven inches`). A hyphen is inside a number only between a tens word and a unit (`twenty-five`), and range splitting skips separators inside a number in words, so `twenty-five to thirty feet` and `five-ten feet` both read as ranges.
  - `percent` rejects a bare fraction in words, since `half` is more likely 50% than 0.5%; `fifty` is 50%.
- **Arithmetic**: `readNumber` reads a product of powers: `10^3`, `10^-3`, `2*5`, `6.02×10^23`, with `*`, `×`, `·` or `⋅` for multiplication and optional spaces around operators. Only `^` and multiplication, because the other operators already mean something: `-` is a sign and a range separator, `+` a sign, `/` a fraction and a unit separator (`km/h`), `x` a dimension (`2x4`).
  - Exponents are integers, and a power can't chain (`2^3^2`) or have a signed base (`-2^2` could mean 4 or -4). A fraction after a power is rejected (`2^3/4`). Any of these makes the number unreadable, so the codec's usual issue applies.
  - The result is computed exactly and rounded once (`1.1*3` is 3.3). A result that overflows or underflows to zero is unreadable (`10^400`).
  - A superscript exponent right after a digit or a standalone constant is normalized to `^` (`10³`, `6.02×10²³`, `10⁻³`, `π²`); after any other letter it stays part of the unit (`m²`), and so does `^` (`m^2`).
  - **Math constants** can be factors: `π`/`pi`, `φ`/`ϕ`/`phi` (the golden ratio) and `e`. A constant can follow a decimal directly (`2π`, `2 pi`, `2,5π`), take a whole-number divisor (`π/2`, `2π/3`) or a power (`π^2`, `π²`, `e^-1`), and join a product (`2*e`). `e` needs the operator, since `2e` starts an exponent or a unit (`2eV`). The words need a boundary, so `PiB` stays pebibytes; the symbols can touch a unit (`πrad`). Uppercase `Π` and `E` aren't constants, and `1/2π` isn't read (it could mean either way round). The rational part stays exact and the constant multiplies it once. There's no `i`: values are real numbers.
  - Money reads its numbers exactly through its own lexer and doesn't accept arithmetic (`$10^6`, `$2*3`); it has magnitude suffixes for large amounts. A quantity's magnitude suffix doesn't apply to an expression (`2*3k ft` is `unknown_unit`). Formatting never prints expressions.
- Input is normalized before lexing (`normalize`): smart quotes (`’ ”` → `' "`), prime marks (`′ ″`), two apostrophes as inches (`5' 11''`), the degree sign's look-alikes (`º` from Spanish and Portuguese keyboards, `˚` from iOS) to `°`, `^` after a letter as part of the unit (`m^2` → `m2`, like `m²`), Unicode fractions (`5½`, `1¹⁄₂`), superscript exponents (`10³` → `10^3`), non-breaking and thin spaces. Case is handled by matching (see [Unit tables](#unit-tables)), not by normalization.

## Formatting

Default formatters use only bundled data, so they're deterministic and round-trip under the same `ctx`, as the round-trip rule requires of first-party codecs:

- Numbers use the region's bundled separators (`formatNumber`).
- Quantities print the number and the unit's first alias: `71 in`, `1,8 m`. This works for custom unit tables without any extra data.
- Money prints exactly the currency's minor digits, and the currency's symbol when that symbol parses back to the same currency under the same `ctx` and codec options, and the ISO code otherwise: `$12.34` for USD in en-US, but `12.34 USD` in en-CA, where `$` means CAD. The symbol goes where the locale puts it (bundled per region, like the separators): `$12.34`, `12,34 €`, `R$12,50`, with a space after a symbol that ends in a letter (`Rp 12,50`). ISO codes always follow the amount: `12.34 CHF`.
- Dates use unambiguous forms: `Oct 2, 2026` in MDY regions, `2 Oct 2026` in DMY regions (month names from the codec's name set for the locale's language, or English), and ISO `2026-10-02` in YMD regions. Never a numeric day/month order.
- Times follow the region's hour cycle (bundled, like the separators): `3:00 PM` or `15:00`, with seconds only when they aren't zero. Date-times join the two (`Oct 2, 2026, 3:00 PM`; `2026-10-02 15:00` in YMD regions), and `dateTime()` adds the offset (`… -04:00`), so the instant survives a round trip.

`quanto/formats` has the `Formatter<T>` type and `compoundFormatter(name, units, parts, { separator?, trailingZeros? })`, which builds a compound formatter over any unit table. `@quantojs/common/formats` has ready-made formatters built with it, for a codec's `format` option:

- **Compound formatters**, from bundled data only, so they're deterministic and round-trip: `feetInches` (`5'11"`, `6'0"`, `11"`), `poundsOunces` (`1 lb 4 oz`), `stonesPounds` (`11 st 4 lb`) and `hoursMinutes` (`2h 30min`; days show as hours). The smallest part is rounded to a whole number and carried (`71.6 in` is `6'0"`), leading zero parts are left out, and later zero parts are kept (`6'0"`, `2 lb 0 oz`). `hoursMinutes` is the exception: durations are written compactly and a whole number of hours stands alone (`2h`, not `2h 0min`). It writes `min` rather than `m` so its output isn't a length when the codec is one of several in a `merge`. Each works with its codec in `@quantojs/common` (`length`, `mass`, `duration`); given a unit outside that table, it throws. `compoundFormatter` throws at definition time for a part that isn't a linear unit of its table.
- **`Intl` formatters**, opt-in, for richer output: `intlUnit({ unitDisplay })` in `@quantojs/common/formats` (localized unit names: `5 feet`, `5 Fuß`), `intlMoney({ currencyDisplay })` in `@quantojs/common/money` (`12.34 US dollars`), and `intlDate({ dateStyle })`, `intlTime({ timeStyle })` and `intlDateTime({ dateStyle, timeStyle })` in `@quantojs/datetime`. They're outside the determinism guarantee and display-only: their output varies between ICU versions and isn't guaranteed to parse back, so a field using one shows raw text for editing (`display="raw"`). `intlMoney` takes decimal places from quanto's bundled table, not Intl's. `intlUnit` covers `@quantojs/common`'s units that Intl knows, and prints the number and unit ID for the rest. `intlDateTime` shows a date-time's wall-clock time as entered, without its offset. They have no fixtures, since exact output depends on the runtime.

## Ranges

A range is two values of one codec, entered in one field. The core has the machinery and quantity ranges; money and dates bring their own range functions:

```ts
import { range } from 'quanto';
import { moneyRange } from '@quantojs/common/money';
import { dateRange } from '@quantojs/datetime';

range(length({ defaultUnit: 'ft' })).parse('5-7 ft');  // { start: { value: 5, unit: 'ft' }, end: { value: 7, unit: 'ft' } }
moneyRange(money()).parse('$10-20k');
dateRange(date()).parse('Oct 3-5');
```

- **`range(codec)`** takes a quantity codec (one with a unit table, including `pace`); the type system enforces it. **`moneyRange`** and **`dateRange`** (for all four date and time codecs) come from their packages.
- **`defineRange(codec, rules?, options?)`** is what they're all built on, and it's public, like `defineCodec`. It does everything that isn't domain-specific: splitting, trying completions, choosing between them, the user's schema, the `start`/`end` schema and formatting. `rules` supply the domain part:
  - `propose(left, right, ctx)` returns textual completions of the two sides, most preferred first. The sides as typed are always tried after them. Completion is textual, so `ctx.now()` throws in it: relative words (`tomorrow`) are left for the sides' parse, which is where the one clock reading for the range happens and is reported.
  - A proposal may carry `adjustEnd(end)`: if the sides parse out of order, try this end instead (checked against the inner codec's schema). Dates use it to roll into the next day or year, since "the next day" can't be written back into text like `tomorrow`.
  - `inOrder(start, end)` says whether the range is in order, or `undefined` when it can't tell.
  - `incompatible(start, end)` returns an issue when two values can't be the ends of one range at all, or `undefined`. Such a pair is skipped like a side that didn't parse (its issue is reported if nothing else parses), and fails the structural check, so `schema` rejects it and `format` throws. Quantities use it for units on different scales.
  - `format(start, end, ctx)` may return a shorter text for a closed range that shares what its sides have in common, or `undefined` for the default `start – end`. Like every format, it must read back through `propose` to the same range. Dates use it when both sides are in one year: `Oct 3–5, 2026`, `Oct 30 – Nov 2, 2026`, `3–5 Oct 2026`. A `date()` with its own `format` option keeps the full form, since a shortened range wouldn't match its look.
  - With no rules, both sides must be written in full. That's the right default for a custom codec with no shorthand.
- The value is `{ start: T; end: T }` using the inner codec's values. There is one `raw` for the whole field, not one per endpoint.
- **Open ranges** are opt-in: `range(codec, { open: true })` (and the same option on `moneyRange`, `dateRange` and `defineRange`) also reads one bound, and its value type widens to `OpenRange<T>`: `{ start: T | null; end: T | null; startExclusive?: true; endExclusive?: true }`. It's an option rather than always on because the wider type would make every consumer handle a missing end, and a schema can't narrow a TypeScript type.
  - Lower bounds: `5+ ft`, `5 ft+`, `$500+`, `≥5`, `>=5`, `at least`, `min`, `minimum`, `from`, `since`, `no less than`, and after the value `or more`, `or above`, `or over`, `or greater`, `or later`, `and up`, `and above`, `and over`, `onwards`. Exclusive: `>5`, `over`, `above`, `more than`, `greater than`, `after`.
  - Upper bounds: `≤7`, `<=7`, `up to`, `at most`, `max`, `maximum`, `until`, `till`, `by`, `no more than`, and after the value `or less`, `or fewer`, `or under`, `or below`, `or earlier`, `and under`, `and below`. Exclusive: `<7`, `under`, `below`, `less than`, `fewer than`, `before`.
  - An exclusive flag is set only when the bound itself is excluded, and only on the bound of an open range; the schema rejects it anywhere else. Both sides null is malformed.
  - Formatting uses symbols, which read back in any language: `≥ 5 ft`, `> 5 ft`, `≤ 7 ft`, `< 7 ft`.
  - Closed ranges are tried first, so `from 5 to 7 ft` is closed and `from 5 ft` is open.
- Every range function takes the shared options (`{ schema?, format? }`). The `id` is derived like merge's, `range(length)`, so `merge([length(), range(length())])` is valid and can accept both `5 ft` and `5-7 ft`.
- **Inner codecs know nothing about ranges.** Codecs have no range hook; range rules live with the range function of their domain.
- Parsing is **two passes**:
  1. **Split.** Separators: `-`, `–`, `—`, `to`, `until`, `through`, and `and` after a leading `between` (`between 5 and 7 ft`). A leading `from` is dropped (`from 5 to 7 ft`). Hyphens also appear inside values (negative numbers, ISO dates `2026-10-03`), so every candidate split is tried.
  2. **Complete and parse.** For each split, the rules propose completions. Both sides of each are parsed with the inner codec, and the first completion where both parse and `start <= end` wins; then the first that's in order after `adjustEnd`; then the first that parsed at all.
- **The completion rules of each domain.** The rule throughout: a side borrows what it's missing from the other side, and when borrowing could go two ways, the reading that keeps `start <= end` wins.
  - Quantities (`range`): a side with no unit borrows the other side's unit text. `5-7 ft` → 5 ft–7 ft; `5'10"-6'` needs nothing. Each side's number is read with the codec's own number syntax, so pace ranges complete too: `5:00-5:30 /km`, as do duration's clock times: `1:00-1:30 min`. A side with no magnitude borrows the other side's only if the result stays in order, as for money: `2-3k ft` → 2,000–3,000 ft, `2-3 million ft`, but `500-1k ft` → 500–1,000 ft.
  - Money (`moneyRange`): a side with no currency (symbol or code) borrows the other side's: `$10-20` → $10–$20, `10-20 EUR` → €10–€20. A side with no magnitude suffix borrows the other side's only if the result stays in order: `$10-20k` → $10k–$20k and `$1.5-2M` → $1.5M–$2M, but `$500-1k` → $500–$1,000.
  - Dates (`dateRange` over `date()`): a side with only a day number borrows the other side's month and year: `Oct 3-5` → Oct 3–Oct 5. A side with no year borrows the other side's. When neither side has a year and the end would fall before the start, the end moves to the next year: `Dec 30 - Jan 2` → Dec 30, 2026–Jan 2, 2027.
  - Times (`dateRange` over `time()`): a side with no meridiem borrows the other side's, unless that would put the start after the end, in which case the start takes the opposite meridiem. `9-11pm` → 9pm–11pm; `9-5pm` → 9am–5pm.
  - Date-times (`dateRange` over `localDateTime()` or `dateTime()`): a side with no date borrows the other side's, wherever the date was written: `Oct 3 3-5pm`, `tomorrow 3-5pm` and `3-5pm tomorrow` all put both times on one day. The times complete as for times. When both sides share a borrowed date and the end time is before the start time, the end moves to the next day: `Oct 3 10pm-1am` → Oct 3, 10pm–Oct 4, 1am. For `dateTime`, a side with no UTC offset borrows the other side's written offset, before falling back to `ctx.now`'s.
- **Which split wins:** splits are tried left to right, and the first split with any completion where both sides parse provides the value. If none does, the result carries the issues of the first side that failed, which is the most specific failure (`5-7 kg` reports `unknown_unit`, from `5 kg`). Text with no separator is `unparseable`.
- **Where ordering is knowable:** quantities (compared in the base unit, with `compare`'s tolerance), money in a single currency, dates, times and local date-times (as strings), and date-times (as instants). A range built with `defineRange` and no `inOrder` counts every reading as in order.
- **Formatting** prints both sides in full, separated by ` – ` (an en dash with spaces): `5 ft – 7 ft`, `$10.00 – $20.00`. It reads back under the same `ctx`, even with negative values.
- Ordering only picks between completions. It isn't enforced: `7-5 ft` parses as typed, and rejecting it is left to the user's schema, which can use `compare` from `quanto/quantity` or `@quantojs/common/money`.
- Open-ended ranges (`5ft+`, `under 10 kg`) are deferred.

## Dimensions

`dimensions(codec, { count })` reads several values written together: `24 × 36 in`, `2 m × 50 cm`, `1920x1080`, `24 x 36 x 10 cm`. It wraps any sync codec, and the value is an array of the inner codec's values. The id is `dimensions(<inner id>)`.

- **`count` is required**: a whole number (`2` for a print, `3` for a box), or `{ min, max }`, inclusive, either end optional (`{ min: 2 }`). Explicit, because no default is right for both sheets and boxes. Too many or too few parts is a `wrong_count` issue; a malformed count throws at definition time.
- **Separators:** `×`, `*`, `by`, and `x` (any case) when it follows something and a number follows it, so `24x36`, `24in x 36in` and `2 by 4` split, and units containing an `x` (`lx`) don't. A `×` or `x` before `10^` is scientific notation (`6.02×10^23`), not a separator. An empty part is unparseable.
- **Shared units:** a unit after the last part applies to the bare numbers before it, as written on signs and spec sheets (`24 × 36 in`, `1.5k x 2k ft`), and any part may carry its own (`2 m × 50 cm`, `5'6" × 8'`). A unit only on the first part isn't shared (`24 in × 36` is `missing_unit` on the second); a `defaultUnit` fills it, as with any bare number. The last part is parsed first, so its issue is the one reported; issues carry the part's index in their `path`.
- **Formatting** joins the parts with ` × ` and writes a unit every part shares once, after the last (`24 × 36 in`), which reads back the same. Parts with different units, or a custom inner format, are written in full.
- It doesn't pass on the parts' alternatives, as `range` doesn't: there would be one per combination of readings.

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

`@quantojs/react` is a thin UI over a codec's `parse` and `format`, so the core package has no UI code and no React dependency. Everything UI-specific (accessories, keyboard hints, display modes, echo) is a component prop, never a codec property. It has three layers:

1. **The field state machine** (`reduce`, `initialState`, `echo`): plain TypeScript, `(state, event) → { state, commit? }`. It holds every rule below, so a React Native adapter can share it later; it moves to its own package when there's a second user. Its spec is a JSON fixtures file of event scripts, like a codec's.
2. **`useQuanto(codec, options)`**, the real API: it owns the text and returns `inputProps` to spread on any `<input>`, plus `echo`, `showEcho`, `issues`, `value`, `pick`, `alternatives`, `choose` and `commit`, for building your own field.
3. **`<QuantoInput>`**, an unstyled default built on the hook: an input, the echo, the issues and an optional accessory, targeted by `data-quanto` attributes. It takes sync and external codecs alike (see [External codecs](#external-codecs)).

**Features go in the hook; the component is the minimal default.** Most apps are expected to build their field on the hook, with their own markup or a form library's. `<QuantoInput>` exists for the quickstart and as the reference wiring (its `aria-describedby` always points at elements that exist), and grows only when the default experience needs it. Anything an app's markup decides (where a list goes, how it looks, how it's positioned) stays out of it: completions, for instance, are in the hook only.

```tsx
import { QuantoInput, QuantoProvider } from '@quantojs/react';
import { length } from '@quantojs/common';

<QuantoProvider ctx={{ locale: 'de-DE' }}>
  <QuantoInput
    codec={length({ defaultUnit: 'in' })}
    defaultValue={{ value: 70, unit: 'in' }}  // raw = format(value)
    defaultRaw={`5'10"`}                       // with defaultValue: restore exactly, no re-parse
    onChange={(v, { context }) => {}}          // QuantoValue<T>, on commit only: blur, Enter, a pick
    display="formatted-on-blur"               // | 'raw' | 'formatted'
    restoreOnEdit                             // focus puts back the typed text; off by default
    inputMode="text"                          // mobile keyboard; see below
    accessory={CalendarPicker}                // optional
  />
</QuantoProvider>
```

- **Uncontrolled by default**, since it owns the envelope internally. An optional controlled `value: QuantoValue<T>` is available; `null` clears the field. While someone is editing, their text wins: a new controlled value that arrives then is dropped, not queued, and their commit on blur settles it (the parent gets it through `onChange` and can set `value` again). Passing back the envelope the field just emitted is a no-op. A parent that rejects a commit by leaving `value` unchanged doesn't reset the text, since an unchanged `value` isn't an update; to reject one, set a different `value`.
- **Commits** happen on blur, Enter and a pick, never per keystroke. A commit emits the stored envelope: `{ raw, value }`, or `{ raw, issues }` when the text didn't parse or the schema rejected it. Text that wasn't edited since the last commit, default or controlled value never commits again, so focusing and leaving a field can't change its value. An untouched empty field doesn't commit. Clearing the text commits whatever the codec makes of `''`: an `empty` issue, or `null` for an `optional` codec. Enter is left to bubble, so a form still submits.
- **`onChange`'s second argument** carries the parse `context` (absent when the value didn't parse), for apps that store it for replay.
- **Issues** show after a failed commit and clear as soon as the text parses again, rather than waiting for the next commit.
- **Display modes** say what the input shows after a commit. The stored `raw` is always what was typed.
  - `formatted-on-blur` (default): a commit on blur replaces the text with `format(value)`; Enter leaves the typed text. Focusing again keeps the formatted text, which is safe because first-party formatters round-trip.
  - `formatted`: every commit, including Enter, shows `format(value)`.
  - `raw`: the text stays as typed. Use it with a display-only formatter (`feetInches` rounds, so `180 cm` would show as `5'11"`).
- **`restoreOnEdit`** (off by default) is for the formatted modes: focusing the field puts back the committed `raw`, so people edit the text they typed rather than the formatted value. The restored text counts as unedited, so it isn't re-parsed, it echoes the stored value, and leaving it untouched shows `format(value)` again without committing. A pick or a default has no typed text, so there is nothing to restore. With it on, a display-only formatter is safe in a formatted mode, since the rounded text is never what gets edited.
- **Live echo**: the hook parses on every keystroke to show its interpretation (`5'11` → `5'11"`), but only emits on commit. There is no "incomplete" parse state; while the text doesn't parse, there's simply no echo. The hook's `showEcho` says whether to display the echo: not when it only repeats the text, and not while issues show, so every field built on it follows the same rule. `echo` itself stays set either way, since its value and alternatives are still the reading. The hook's `alternatives` are the live parse's while typing (an `ambiguous` failure's too) and otherwise the last commit's, so a field can offer a chooser, shown with the issue after an `ambiguous` commit; `choose(value)` takes one. Alternatives from a commit remain in transient field state across blur and Enter, so choosing one is not interrupted by the blur that precedes a click. They clear on editing, a new external value or a pick; they never enter the stored envelope, and restored text is not re-parsed to reconstruct them. Composing an IME character is never parsed.
- **Raw display** always shows the interpretation next to the text, so stale relative input (`tomorrow`) is never misleading.
- **Accessories** are a component prop (e.g. a calendar icon that opens the OS picker). An accessory receives `{ value, onChange, focused }`, and choosing a value sets the text to `format(value)` and commits it, after the codec's schema. Text entry always stays available.
- **Context** comes from `<QuantoProvider ctx>` or a field's `ctx` prop, and defaults to `en-US`. The browser's locale is never read implicitly, so server and client render the same text. In a browser, leave `now` unset.
- **Keyboard hint** is the `inputMode` prop. Height needs a keyboard that can type `'` and `"`, which a numeric keypad can't, so the default is `text`.
- **Accessibility**: `aria-invalid` follows the shown issues, `aria-describedby` points at the echo and the issues, and the issues are a `role="alert"` region, so they're announced on commit. The echo isn't live, so nothing is announced per keystroke.
- **The codec needn't be stable** across renders: parsing is cheap and pure, so `codec={length({ … })}` inline is fine.
- **Form libraries** are not a design driver. The field exposes `value` / `onChange` / `onBlur` / `ref`, which is enough for React Hook Form's `Controller` and TanStack Form; dedicated adapters may follow.
- **No `codec`** means plain text, like `text()` from `@quantojs/common` (the package defines its own, so it doesn't depend on `@quantojs/common`): the value is the trimmed string as typed (blank is an `empty` issue, unless wrapped in `optional`). An "accept anything" codec is `@quantojs/anything` (see [Anything](#anything)).
- **External codecs** get their own hook, `useExternalQuanto`, which parses on commit only, and use the same `<QuantoInput>` (see [External codecs](#external-codecs)).
- **Not yet:** compound parts (`Quanto.Root`, `Quanto.Input`, …) for custom layouts; the hook covers custom layouts meanwhile.
- **Platforms**: the core is pure TypeScript with no runtime dependencies and no UI code. Web is first, with React 19. React Native is another separate adapter over the same state machine.

## Packaging

- ESM only, with `"sideEffects": false`.
- No runtime dependencies. The Standard Schema interface is vendored into `src/` (types only), as the Standard Schema spec recommends, so there is no dependency on `@standard-schema/spec`.
- **Protocol and codecs.** `quanto` is the protocol: what every codec must do and the helpers to do it, held to strong opinions and expected conformity. It ships no codecs. The codecs are a bootstrap, in `@quantojs/common` and the dedicated packages: use them, copy and modify them, or write your own. The line isn't size; `quantity()` and the compound formatter builder are in the core because they're how codecs are defined, not codecs themselves.
- `quanto`'s subpath exports:
  - `quanto`: the protocol. `defineCodec`; `defineExternalCodec`, `isExternalCodec` and `parseFromCompletions`; `formatWithFallback` and `isInvalidValueError`; `quantity`; the primitives `normalize`, `readNumber`, `formatNumber`, `readNumberToken`, `readWordToken`, `formatDecimalParts`, `numberSpan` and `lookupRegional`; `merge`, `optional`, `approx`, `range`, `defineRange` and `dimensions`; and the types `Codec`, `ExternalCodec`, `ExternalCodecDefinition`, `CodecOptions`, `Ctx`, `CtxExtensions`, `Signal`, `ResolvedCtx`, `Locale`, `ParseResult`, `ParseOutcome`, `ParseContext`, `Issue`, `IssueCode`, `Grammar`, `NumberGrammar`, `QuantoValue`, `Quantity`, `Approx`, `Range`, `OpenRange`, `RangeOptions`, `RangeRules`, `RangeProposal`, `QuantityCodec`, `QuantityOptions`, `QuantityDefinition`, `UnitTable`, `UnitDefinition`, `DefaultUnit`, `NumberSyntax` and `NumberToken`.
  - `quanto/quantity`: quantity operations (`convert`, `compare`).
  - `quanto/formats`: the `Formatter<T>` type and `compoundFormatter`.
  - `quanto/testing`: `roundTrip`, `quantityWithin` (its rounding allowance for quantities) and `runFixtures`, the generic fixture runner.
- `@quantojs/common`'s subpath exports:
  - `@quantojs/common`: the quantity codecs and their unit tables (`length`/`lengthUnits`, `mass`/`massUnits`, …); `number`, `percent`, `ratio` and `text`.
  - `@quantojs/common/money`: `money`, the `Money` type, `add`, `subtract`, `compare`, `scale`, `convert`, `allocate`, `roundWithMode`, `moneyRange`, `intlMoney`, and the currency data (`isKnownCurrency`, `minorDigits`).
  - `@quantojs/common/odds`: `odds`, the `Odds` type, `convert`, `compare`, `fromDecimal`, `toDecimal` and `impliedProbability`.
  - `@quantojs/common/formats`: ready-made formatters (`feetInches`, `poundsOunces`, `stonesPounds`, `hoursMinutes`, `intlUnit`).
- **Repository layout.** A bun workspace: `packages/quanto` (the core, npm `quanto`), `packages/common` (`@quantojs/common`), `packages/datetime` (`@quantojs/datetime`), `packages/music` (`@quantojs/music`), `packages/react` (`@quantojs/react`), `packages/libpostal` (`@quantojs/libpostal`), `packages/libphonenumber` (`@quantojs/libphonenumber`), `packages/geo` (`@quantojs/geo`), `packages/sizes` (`@quantojs/sizes`), `packages/anything` (`@quantojs/anything`) and `apps/site` (the website). The private root holds the shared dev tooling (TypeScript, tsdown, vitest, `tsconfig.base.json`, one `vitest.config.ts` for every package) and the repo docs (`DESIGN.md`, `AGENTS.md`). `bun run typecheck`, `bun run build` and `bun run test` at the root cover every package.
- UI adapters are separate packages (web React first, React Native later). The core package never imports them.
- **`@quantojs/common`** (`packages/common`) has the common codecs (see above). **`@quantojs/datetime`** (`packages/datetime`) is a separate codec package: `date`, `time`, `localDateTime`, `dateTime`, `dateRange`, `intlDate`, `intlTime`, `intlDateTime`. So is **`@quantojs/libpostal`** (`packages/libpostal`): `address` (see [Addresses](#addresses)), **`@quantojs/music`** (`packages/music`): `pitch` and `timeSignature` (see [Music](#music)), **`@quantojs/libphonenumber`** (`packages/libphonenumber`): `phoneNumber` (see [Phone numbers](#phone-numbers)), **`@quantojs/geo`** (`packages/geo`): `coordinates` (see [Coordinates](#coordinates)), and **`@quantojs/sizes`** (`packages/sizes`): `ringSize` and `shoeSize` (see [Sizes](#sizes)). **`@quantojs/anything`** (`packages/anything`) is `anything()`, over all of them (see [Anything](#anything)).
- **Core, common or package?** A codec never goes in the core. A new first-party codec goes in `@quantojs/common` when its behaviour is complete and settled: unit tables (`length`, `dataSize`), small parsers (`percent`, `pace` with its number syntax), and finished domains with their own subpath (`@quantojs/common/money`). A domain that's intentionally incomplete or still evolving, so its parse results are expected to change between releases, gets a dedicated package: `@quantojs/datetime`, whose grammar covers the common case with a list of omissions that will shrink. What goes in the core is what codecs share: the contract, definition helpers and primitives a codec would otherwise reimplement, decided once.
- **Why packages.** Not bundle size: everything tree-shakes. The protocol and the codecs change for different reasons: the protocol rarely, and only by deliberate decision; codecs whenever their parsing improves, and parse changes affect replay (see [Parse context](#parse-context)). Separate packages let the codecs evolve without moving the protocol's version, and an evolving domain without moving the settled ones.
- **How they're built.** A codec package uses **only quanto's public API**, imported by name (`quanto`, `quanto/quantity`, `quanto/formats`, `quanto/testing`), exactly as a custom codec would. That keeps Principle 5 honest: anything a package needs that isn't public is a gap in the API, not a reason to reach into internals.
  - `quanto` is a peer dependency (`workspace:^` in the repo, replaced by the real version on publish). In the repo, `quanto` and the `@quantojs` packages resolve to their source (tsconfig paths for typechecking, a vitest alias for tests), so nothing needs building first.
  - The core's own tests of composition (`range`, `merge`, `dimensions`, …) use `@quantojs/common`'s codecs, as a dev dependency. The cycle is test-only: the published core never imports a codec package.
  - Codec packages don't depend on each other. `@quantojs/react` defines its own plain-text codec rather than importing `text()`.
  - Their codecs all follow the same rules: extensive fixtures, round-trip properties, and `DESIGN.md` as the source of truth.
- Nothing is attached to the component or a namespace object.
- **Releasing.** `quanto` and the `@quantojs` packages release in lockstep, from 0.1.0. To release: bump every package's version, run `bun install` (bun fills `workspace:^` ranges in from the lockfile), run `bun run check`, `bun run build` and `bun scripts/pack.ts` (which fails on mismatched versions or a stale peer range), and commit. Then publish one of two ways, `quanto` first, since the others' peer dependency points at it:
  - **Locally:** `bun publish --access public --otp <code>` in each package directory, after `npm login`, with a code from the npm account's authenticator app. (For 0.1.0, bun's browser login failed with a 404 while polling; the one-time code worked.)
  - **From CI:** push a `vX.Y.Z` tag. `.github/workflows/publish.yml` checks, builds, packs, lints the tarballs (publint, are-the-types-wrong) and publishes with npm provenance. It needs an `NPM_TOKEN` repository secret. Don't push the tag for a version already published locally: the workflow would fail trying to publish it again.

  CI runs the same pack and lint steps on every push.
- **Consumer reference.** The README's "Using quanto" section and the TSDoc on the exported types are the reference for apps and agents using quanto. The README ships in every npm package, so it's at `node_modules/quanto/README.md`; the TSDoc reaches agents at the point of use, through the published `.d.ts` files. The storage rules (store `{ raw, value }`, `value` is authoritative, never re-parse `raw`, validate with `codec.schema`, `context` is opt-in) must appear in both, in particular on `ParseResult`, `QuantoValue`, `ParseContext` and `Codec.schema`. A SKILL.md, if one is ever shipped, is generated from the README, never the source of truth.
- The package ships an `AUTHORING.md` (see below) so it is discoverable inside `node_modules`. It is deliberately not called `AGENTS.md`: the repo's root `AGENTS.md` holds instructions for agents working on quanto itself and is not shipped.

## Testing: fixtures are the spec

Every codec, first-party or custom, ships fixtures, and CI enforces it. Fixtures are the codec's spec: they pin down everything finicky about it. For first-party codecs they are extensive, covering common inputs, locales, compound forms, every issue code the codec can produce, alternatives, parse context and formatting. Fixtures are **JSON**, next to the codec, so they can be read and written without touching TypeScript and run by one generic runner:

```jsonc
// packages/common/src/length/fixtures.json
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
// packages/quanto/src/merge/fixtures.length-duration.json
[
  { "parse": "1m",
    "value": { "codec": "length", "value": { "value": 1, "unit": "m" } },
    "alternatives": [{ "codec": "duration", "value": { "value": 1, "unit": "min" } }] }
]

// packages/datetime/src/date/fixtures.json
[
  { "parse": "tomorrow", "ctx": { "now": "2026-09-30T23:30:00-04:00" }, "value": "2026-10-01",
    "context": { "locale": "en-US", "now": "2026-09-30T23:30:00-04:00" } }
]
```

- A **parse fixture** is `{ parse, ctx?, options?, value | issues, alternatives?, completions?, context? }`. `issues` lists the expected issue codes, in order. `alternatives` may go with either `value` or `issues`; a missing `alternatives` means none are expected, and likewise `completions` (external codecs only; see [Completions](#completions)). `context` is checked only when given.
- A **complete fixture** is `{ complete, ctx?, options?, completions }`, for external codecs with completions. Each expected completion is `{ label, value }`: the runner resolves lazy ones through the stub before comparing, so the file stays JSON.
- A **format fixture** is `{ format, ctx?, options?, text }`.
- `options` are passed to the codec factory, so one file covers the factory's JSON-expressible options (`defaultUnit`, `canonicalUnit`, `defaultCurrency`…).
- A codec can have several fixture files (`fixtures.json`, `fixtures.<variant>.json`). Wrappers (`merge`, `range`, `optional`, `approx`) have fixtures too, one file per inner-codec combination worth pinning down: `range` over `date` for completion, `merge` over `length` and `duration` for alternatives.
- **`runFixtures(factory, fixtures, { test })`** in `quanto/testing` runs a file. It takes the test function (vitest's `test`, `node:test`…) rather than importing a framework. Each case is named after its input and context, so a failure reads as input, expected and actual.
- Fixtures must not depend on the machine. The runner fails any fixture whose result `context` has a `now` the fixture didn't pass; time-dependent fixtures pass `ctx.now`.
- An LLM adding a codec writes the fixtures **first**, then the parser.
- **Round-trip property.** Required for every first-party codec, and for any custom codec whose formatter is meant to round-trip: `parse(format(v))` round-trips within the formatter's rounding across a set of values. The `roundTrip(codec, values, { test, same? })` helper in `quanto/testing` does this; `values` is a plain array, so no property-testing library is needed. It checks the value as well as the text, since stable text can hide a changed value (a formatter that drops an offset the parser then assumes): the parsed value must be `same` as the original, by default deep-equal (numbers to an ulp), and formatting it again must give the same text. A formatter that rounds declares how much: `quantityWithin(codec, { places, unit? })` allows half a unit in the last printed place, in `unit` or the original's unit (`{ places: 3 }` for the default quantity formatter, `{ unit: 'in', places: 0 }` for `feetInches`).
- **What isn't tested:** plumbing. No unit tests that a factory returns a codec, that `defineCodec` wires up `schema`, that definition-time errors fire, or that types infer. Behaviour that matters shows up in fixtures; the rest shows up in typecheck or on first use.
- First-party codecs follow the same rules. They have no private escape hatches.
- **One check command.** `bun run check` runs typecheck, unit tests, all fixture files and the round-trip properties. In the quanto repo, CI runs it; implementing agents don't (see `AGENTS.md`). App authors run it for their own codecs.
- **`AUTHORING.md`**, shipped in the package, is the codec authoring guide: `defineCodec`, the primitives, the file layout (`src/codecs/<name>/{index.ts, fixtures.json}`), the issue codes, the fixture format, the round-trip rule and the check command. It stays short.

## External codecs

Additive: no existing type or function changed for them. A first-party LLM codec is not built yet (see the end of this section). An **external codec** hands parsing to something outside the field: a model, a server, a worker. The marquee example is an **LLM-powered codec**, where a model parses free text into a structured value.

### The rule: an external codec owns its whole parse

Parsing never lives in two places. Once a parse is external, all of it is external, including whatever `merge`, `range` or `approx` would have done: a service that should accept a length or a duration, a range, or `about 5`, does that itself. That is why only parsing is async, and why the wrappers don't take external codecs (except `optional`, which doesn't parse; see below). It is the reason for the name: "external" says where the parse lives, which is also what explains the limits; "async" would only describe the mechanism.

### Shape

```ts
interface ExternalCodec<T> {
  readonly external: true;                      // what optional() and the guards read
  readonly id: string;
  parse(text: string, ctx?: Ctx): Promise<ExternalParseResult<T>>;
  complete?(text: string, ctx?: Ctx): Promise<Completion<T>[]>;  // optional; see Completions
  format(value: T, ctx?: Ctx): string;          // sync, like every codec's
  readonly schema: StandardSchemaV1<T, T>;      // sync, like every codec's
}

// Either branch may also carry completions; see Completions.
type ExternalParseResult<T> = ParseResult<T> & { completions?: Completion<T>[] };
```

- **A separate interface, not a flag on `Codec`.** `Codec` doesn't change. Since `parse` returns a Promise, an `ExternalCodec` isn't assignable to `Codec`, so passing one to `merge`, `range`, `approx` or `useQuanto` is a type error. `external: true` marks it at runtime: `optional` reads it to pick its return kind, and those others throw a programmer error that says where the work belongs, for JavaScript callers. `isExternalCodec(codec)` tests it.
- **`format` is sync.** Formatting is local and deterministic, from the value alone, so anything that displays a value (a list view, the field after a commit, server rendering) works the same for every codec, with no pending state. An LLM codec formats with a template, which also round-trips. Prose from a model, if wanted, is the app's own display-only call, never used to set `raw`.
- **`schema` is sync**, as for every codec. quanto has no async validation: checks that need a server (is this name taken?) belong to the app or form layer, after commit. The `schema` option is synchronous everywhere, external codecs included.
- **`check` is sync.** It's structural.

### Defining one

`defineExternalCodec` is `defineCodec` with an async author `parse`, and it does the same work: empty input (returned without calling the service), resolving `ctx`, the structural `check`, the user's `schema`, the parse `context`, the `format` override and the composed `schema`.

```ts
interface RecipeYieldOptions extends CodecOptions<Quantity> {
  // The service: text in, a value or issues out. Rejects when it can't answer.
  service(request: { text: string; locale: string }, init: { signal?: AbortSignal }): Promise<ParseOutcome<Quantity>>;
}

export const recipeYield = (options: RecipeYieldOptions) =>
  defineExternalCodec<Quantity>({
    id: 'recipe-yield',
    parse: (text, ctx) => options.service({ text, locale: ctx.locale.tag }, { signal: ctx.signal }),
    format: (value, ctx) => `${formatNumber(value.value, ctx)} ${value.unit}`,
    check: checkQuantity,
    options,
  });
```

- It is the one builder for external codecs, first-party or custom, so Principle 5 still holds. It shares its machinery with `defineCodec`.
- The author's `parse` returns `Promise<ParseOutcome<T>>`. Its `ResolvedCtx` also carries `signal` (below), to pass to whatever it calls.
- The definition is `ExternalCodecDefinition<T>`: `CodecDefinition<T>` with that async `parse`.

### Failures and cancelling

- **Bad input is an issue; a failed service is a rejection.** When the service understood the text and it isn't valid, `parse` resolves with issues, as for any codec. When the service couldn't answer (network error, rate limit, timeout, a malformed reply), `parse` rejects with that error. An outage isn't the user's mistake, so it must never become `{ raw, issues }` in a stored envelope. The host decides the retry policy.
- **`ctx.signal?: AbortSignal`** cancels an in-flight parse, which rejects with `signal.reason` (the platform convention). `defineExternalCodec` checks it before calling the service, and races the service against it, listening before the service starts, so an abort rejects at once (even one raised while the service is starting, and even if the service ignores the signal), and with `signal.reason` even if the service then fails with its own error. Sync codecs ignore it. It isn't recorded in `ParseContext`. The core has no DOM or Node types, so its `Signal` type is the platform's `AbortSignal` wherever that's declared, and otherwise the `aborted` and `reason` that quanto reads.
- **Context.** A successful parse reports `context` like any other. An external parse may not be reproducible, but Principle 8 only requires the stored value to be stable. Recording provenance (which model produced a value) is not planned; if it's needed later, it goes on `context`.

### Completions

A **completion** is a candidate value for the text as it stands, which may not be finished. There is no point at which input is complete: `1600 Amph` wants completions, and so does an address that already parses but could be more precise (a suite number, a nearby match). So completions are offered for whatever the text is, parsed or not.

```ts
type Completion<T> =
  | { label: string; id?: string; value: T }                         // the value is known
  | { label: string; id?: string; resolve(ctx?: Ctx): Promise<T> };  // fetched only when chosen (a place's details)
```

- **`id`** identifies a completion when labels repeat (`12 Main St` in two towns); the field uses it for list keys.
- **`complete` is optional**, on `ExternalCodecDefinition` and on the codec. It uses the same service as `parse`, so an app wires the provider once. `defineExternalCodec` returns `[]` for empty text without calling the service, runs `check` and the schema on known values (dropping ones the schema rejects), and wraps `resolve` so its value goes through `check` (a failure is a bug, so it throws) and the signal. The schema runs on a resolved value when it's picked, as for any pick: one it rejects commits `{ raw, issues }`.
- **A completion is never applied without being chosen.** Commit parses the typed text; it never takes the first completion. That is the line between completing and guessing.
- **Choosing one is a pick**: the text becomes `format(value)`, `raw` is set from it, and it commits without a parse, after the schema, as for any pick. This is the difference from an alternative, which is a reading of the typed text and keeps `raw`.
- **Parse results carry completions.** An external parse may return `completions` on either branch: with an `ambiguous` issue, the candidates it couldn't choose between; on success, refinements of the value. They're the candidates the parse actually saw, without a second call to the service. Lazy candidates (labels that need a fetch to become values) go here; candidates that are already values can go in `alternatives` instead. Only external results carry completions: `resolve` is async, and only the external field can wait for a pick.
- **Parse and complete are different operations on one service.** `complete` answers "what might this become?" and an empty list is a normal answer; `parse` answers "what is this?" and has to commit. Parse is complete plus a choosing rule, and the rule is the codec's to state.
- **`parseFromCompletions(complete, { accept? })`**, from `quanto`, builds an author `parse` from a `complete` function for services that only complete. The default `accept`: no completions is `unparseable`; exactly one is resolved and becomes the value; several are an `ambiguous` failure carrying them as `completions`. A codec with a better signal (an exact match with the text, a confidence score) passes its own `accept`. "Take the first" is never a default: completion services treat text as a prefix, so `12 Main St` completes to `120 Main St`.
- **Failures are quiet.** A `complete` that rejects shows no list; it doesn't put the field in `failed`, since completions are help, not the value. A `resolve` that rejects is a service failure like a parse's (below).
- **`ctx.session?: string`** identifies a completion session, for services that bill completions and the details fetch as one (Google's session tokens). The field sets it: a new session starts with the first edit and ends when a value is committed (by a parse or a pick), and `complete`, `resolve` and `parse` within it get the same one. It isn't recorded in `ParseContext`. `ctx.signal` cancels `complete` and `resolve` as it does `parse`.
- Not to be confused with a range's textual completions (see [Ranges](#ranges)), which are internal to `defineRange`.

### Wrappers

- **`optional`** accepts an external codec: it maps empty text to `null` without calling the inner codec, so it adds no parsing, and passes `complete`, completions and alternatives through. Its return type follows its argument: `optional(external)` is an `ExternalCodec<T | null>`. That takes two overloads, sync and external, an exception to Principle 2 (as `range`'s `open` is), because a conditional type over the codec would change the type parameter from the value to the codec and break existing `optional<T>(codec)` calls.
- **`merge`, `range`, `defineRange`, `approx` and `dimensions`** accept sync codecs only, per the rule above.

### The input component

External codecs get their own hook, `useExternalQuanto`, over their own field state machine (`reduceExternal`, `initialExternalState`). The sync field's behaviour is built on parsing every keystroke; an external field parses only on commit, and is a separate, smaller machine rather than a mode of the sync one. The component is shared: `<QuantoInput>` takes either kind of codec.

- **Kept from the sync field:** commits on blur, Enter and a pick (a pick commits at once, without a parse, after the codec's sync schema); display modes and `restoreOnEdit` (`format` is sync, so they work unchanged); controlled and uncontrolled use; unedited text never re-commits; issues show after a failed commit. Unlike the sync field, issues stay until the next commit settles, since nothing is parsed while typing.
- **Dropped:** the live echo. Nothing is parsed per keystroke; completions take its place (below).
- **Alternatives** come from a commit: a successful one's, or an `ambiguous` failure's alongside its issue. They're kept and cleared as in the sync field, and choosing one commits it with the typed `raw`.
- **The machine stays pure.** `reduceExternal` returns, alongside the state and any commit, effects: `request: { id, text }`, a parse to start, and `abort: ids`, requests that are no longer wanted. The adapter runs them and dispatches the outcome back as `resolved { id, result }` or `rejected { id, error }`. A result whose `id` isn't the current request is ignored. Its spec is a fixtures file of event scripts, like the sync field's, and a React Native adapter can share it.
- **States** add `pending` (a parse is in flight, and what started it: blur or Enter, which decides whether the result is shown formatted) and `failed` (the service rejected). A failure keeps the text, still edited, and commits nothing, so the next blur or Enter parses it again; a `retry` event does it now. An edit clears it.
- **Cancelling.** The hook owns an `AbortController` per request. Editing the text or a pick aborts the one in flight, and so does unmounting. React can also tear the hook's effects down and set them up again while keeping its state (StrictMode, a hidden `<Activity>`): the teardown aborts the parse, and the setup starts it again under the same id, so the field picks up where it left off rather than staying pending. The service gets a signal that also follows the caller's `ctx.signal` (a form-level timeout, say); a cancellation from there isn't the field's own, so it comes back as a rejection and the field settles as failed. Blurring and refocusing without editing lets it finish and commit. A blur while an Enter's parse is pending doesn't start another.
- **The hook exposes** `pending`, `failed`, `error`, `retry()`, `alternatives`, `choose(value)` and `settled(): Promise<QuantoValue<T> | undefined>`, which resolves once no parse (or chosen completion's fetch) is in flight, with the committed envelope, and rejects with the service's error if that parse failed, or with an `AbortError` if the field is unmounted or hidden first (and at once, when called while it is), so a submit awaiting it never hangs. An app awaits it before submitting. `inputProps` add `aria-busy` while pending.
- **`<QuantoInput>` with an external codec** renders the input, an optional accessory and the alert region, with `data-quanto-pending` and `data-quanto-failed` on the wrapper while those hold. A failure shows `failedMessage` (English by default) in the alert region. It has no echo. It switches on `codec.external`, rendering one of two inner components by the codec's kind, so each calls one hook and a change of kind remounts the field rather than breaking the rules of hooks. `failedMessage` is accepted with either kind and only used by an external field, so the props stay one plain type.
- **Controlled values.** As in the sync field, an edit wins over a controlled value that arrives meanwhile, and that includes an edit whose parse is still in flight after blur.
- **Completions** are in the hook only, and opt-in: `useExternalQuanto(codec, { completions: true })`. With a codec that has `complete`, it asks while typing; without one, the list still shows a commit's completions and alternatives. Opt-in for two reasons: the input's combobox attributes are only correct when the app renders the list, and a billed service shouldn't be asked for completions nobody shows. No component renders them; the list's markup, look and positioning are the app's (see the recipe below).
  - An edit emits a `complete: { id, text }` effect; the hook debounces it (`completionDelay`, default 150 ms), so the machine has no timers. Starting a parse cancels the completions request in flight, since the parse's answer supersedes it. Results come back as `completed { id, completions }`; stale ids are ignored, and a rejection just leaves the list empty.
  - **One list.** While typing it shows the completions for the current text; after a commit, the result's completions and alternatives. Each entry says which it is, since choosing them sets `raw` differently.
  - **Choosing** a known value picks it at once. A lazy one enters `resolving` until `resolve` settles: an edit or another pick aborts it, `settled()` waits for it, and a rejection puts the field in `failed`, where `retry()` or Enter fetches it again. The text is still what was last committed, so a blur does nothing: unedited text is never parsed or committed again.
  - **Keyboard:** the arrow keys move the highlight (wrapping, and reopening a list Escape closed); Enter picks the highlighted entry, without letting the form submit, or with none commits the text as usual; Escape closes the list until the next edit or arrow key. The pointer highlights what it's over. `listProps` and `itemProps` keep focus in the input on mousedown, so choosing with the pointer isn't a blur that would start a parse. The hook's `commit()` always commits the text (a `commit` event), whatever is highlighted.
  - **An edit counts as focus.** Text only changes in a focused input, so an edit that arrives without a focus event (autofill, automation) still opens the list.
  - A blur while a chosen completion is fetched doesn't commit the text: the fetch will. A controlled value that arrives meanwhile is dropped.
  - The machine numbers sessions, and the hook turns each into a token (a UUID where the platform has one) for `ctx.session` (see [Completions](#completions)).
  - **The hook exposes `completions`**, undefined unless the option is on, so the opt-in shows in the types:

    ```ts
    completions?: {
      open: boolean;
      items: CompletionItem<T>[];   // { kind: 'completion' | 'alternative'; label: string; … }
      highlighted: CompletionItem<T> | undefined;
      resolving: boolean;
      listProps: …;                 // id, role="listbox", and focus moving here isn't a blur
      itemProps(item): …;           // id, role="option", aria-selected, choose on click
      select(item): void;
    }
    ```

    With it on, `inputProps` add `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete="list"` and the keyboard handling. Alternatives are items too, with `kind: 'alternative'`, so an ambiguous commit opens the list; `alternatives` stays on the field for apps without completions.
  - **The recipe**, in the README and the site, is the reference, not a shipped component:

    ```tsx
    const field = useExternalQuanto(codec, { completions: true });

    <input {...field.inputProps} />
    {field.completions?.open && (
      <ul {...field.completions.listProps}>
        {field.completions.items.map((item) => (
          <li key={item.key} {...field.completions.itemProps(item)}>{item.label}</li>
        ))}
      </ul>
    )}
    ```

    `item.key` is the completion's `id` when it has one, so labels can repeat (`12 Main St` in two towns).
- **Enter still bubbles**, unless it picks a highlighted entry. Whether a form may submit while a parse is pending is the app's decision; `pending` and `settled()` give it what it needs.

### Testing external codecs

An external service isn't part of the codec's code and may not be deterministic, so fixtures and the round-trip property run against a **stub**:

- **The service is injected.** An external codec takes what it calls as an option: a plain async function from request to response (a `model` for an LLM codec). quanto has no SDK or network dependency, and swapping in a stub is just passing a different function.
- **Every external codec ships a stub** next to its fixtures (`src/codecs/<name>/stub.ts`): hard-coded and deterministic, typically a lookup table from request to canned response. Fixtures run through a factory that closes over it. Fixture files stay plain JSON and follow the same rules as any other codec.
- **`runFixtures` and `roundTrip`** accept external codecs and await their parses: the test function they register is async for them. Round-trip goes through the same stub: `parse(format(v))` must give back `v`.
- **Completions are fixtures too**: `complete` fixtures, and `completions` on parse fixtures (see [Testing](#testing-fixtures-are-the-spec)). The stub answers `complete` and `resolve` as well as `parse`.
- **What this covers:** the codec's own code (building the request, reading the reply, validation, issue mapping, `context`). What it doesn't: how accurate a real model is. That's an eval, run outside CI, and not part of the codec's definition of done.
- **Not built yet: a first-party LLM codec.** It's evolving by nature, so it gets its own package (see [Packaging](#packaging)). Its request shape (likely an instruction, the text and a JSON Schema for the value) depends on the deferred JSON Schema exports for value shapes.

## Non-goals

- A validation or constraint API (delegated to Standard Schema).
- Object or array schema composition (that's what Zod, Valibot and ArkType are for).
- Date math (possible future separate package, built on Temporal).
- Dimensional algebra.
- Fetching exchange rates or any other external data.
- Configuration knobs for edge cases in first-party codecs (write a custom codec instead).
- IANA time zones in first-party codecs (write a custom codec on Temporal instead).

## Deferred

Decided in principle, not in v1:

- **Sub-minor-unit money** (`$3.459`): an optional `precision` option on the money codec.
- **Calendar durations** (`2 months`): a separate codec with an ISO 8601 duration value (`P2M`).
- **Grammars for other languages**: a separate package, since they're incomplete and will change, starting with the languages dates have names for (`es`, `fr`, `de`, `it`, `pt`, `nl`). Month and weekday names could later become a grammar part too, replacing the `names` option.
- **Ranges over a merge** (`5-7 kg` against `merge([length(), mass()])`): `range()` takes a quantity codec, and a merged codec has no single unit table. Dropped on purpose when `range()` became quantity-only; `defineRange(merged, rules)` with custom rules covers it if needed.
- **Gas mark** (`gas mark 4`): the number follows the unit, and only a few discrete marks exist, so it's a custom codec rather than a function unit.
- **Agent tooling** beyond the basics above: an `explain(codec, text, ctx)` trace, a CLI with JSON output, a `new-codec` scaffold, and JSON Schema exports for the value shapes.
- **A first-party LLM codec**, as an external codec in its own package: see [External codecs](#external-codecs).
- **React Native adapter**, including how accessories are split between platforms.
- **Completions for sync codecs** (`5 kilo` → kilograms or kilometres, `next fr` → Friday): known values only, since a sync field can't wait for a pick. `Completion<T>` already allows it; the sync field's echo and alternatives cover most of the need meanwhile.
- **Knowing whether the region was given** (`ctx.knownRegion`): a missing locale defaults to `en-US`, and a language-only tag infers its region (`es` → ES), so `phoneNumber` reads `(415) 555-2671` as a US number in an app that never set a locale. A per-call field naming the region only when a passed locale wrote it would let such codecs refuse instead. Replay stays exact if a guessed region only ever makes a codec refuse, never read differently. Deferred: people expect US defaults, and it isn't worth the extra API until someone reports a problem.
- **Sync address-part codecs** (`postalCode`, `country`, `subdivision`): the normalization `@quantojs/libpostal` does inside its parse, as codecs of their own for fields that ask for one part.

## Open questions

1. The input component name (`QuantoInput` in `@quantojs/react` for now).
2. Whether the issue-code union stays closed, growing by additions like `ambiguous`, or custom codecs get a way to add codes of their own.
