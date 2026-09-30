# Quanto — Prior art

## Summary and key findings

The reviewed projects support Quanto's overall API direction. None provides a compelling reason to replace the `QuantoType<T>` parse/format contract, explicit dimension definitions, standalone operations, plain JSON-safe values, or a thin input adapter. Their main contribution is implementation guidance and concrete edge cases for fixtures.

- **Parsing must distinguish understanding a complete field from extracting a measurement from prose.** Some parsers accept a useful fragment while ignoring the rest. Quanto should specify full-input consumption and ambiguity policies before implementing its grammar.
- **Plain data is a meaningful architectural choice.** Objects with `value` and `unit` properties can still contain prototypes, descriptors, or recursive conversion getters. Verify actual JSON serialization and restoration.
- **Editing text and committed values need separate lifecycles.** Incomplete input, failed commits, cancellation, and external updates need explicit behavior. This may require an optional inspection capability or a parse-result extension; the research does not settle that API choice.
- **Formatting needs numerical care.** Conversion drift, compound-unit carry, negative compound values, and rounding tolerance need fixtures. Keep rounding out of stored values.
- **Unit meaning must survive parsing.** Rewriting units into bare numbers makes expression evaluation convenient but can erase dimensions. Quanto's exclusion of dimensional algebra remains useful.
- **Locale handling extends beyond commas and periods.** Include localized digits, signs, spaces, grouping, and partial input in the test corpus.
- **Two semantic questions remain open:** whether validation failure should permit `mergeTypes` to try another type, and how draft/commit states should be exposed. These are design decisions, not merely implementation details.

`DESIGN.md` remains the design authority. Recommendations below are proposals and fixture candidates, not adopted behavior. Do not silently change Quanto's API to mirror another project.

## Scope and evidence

Research conducted on 2026-09-30 against the current Quanto draft. Source and selected tests were inspected for six repositories; Adobe's number parser was reviewed through its official documentation. Small direct-function probes were run for fluent-measures, units-and-measurement, i-input, and js-quantities. Full upstream test suites and browser interaction tests were not run.

Source observations refer to the pinned commits linked below, which may differ from published npm releases. Documentation claims, observed behavior, and Quanto recommendations are distinguished explicitly.

## Lookup guide

| Work in Quanto | Start with | What to inspect |
|---|---|---|
| Human measurement grammar | fluent-measures | Tokenization, component matches, punctuation and hyphen regressions |
| Quantity data and conversion | units-and-measurement | Base conversion formulas, custom dimensions, serialization tradeoffs |
| Input editing and commit behavior | i-input | Draft text, committed value, Enter/blur/Escape, headless adapter |
| Compound formatting and precision | UnitMath | Near-integer handling, remainder cleanup, unit splitting |
| Temperature semantics and comparison | js-quantities | Absolute temperatures versus differences; equality versus representation |
| Locale-aware numeric lexing | @internationalized/number | Unicode digits/signs, expected formats, partial-number validation |
| Formatting while typing | react-number-format | Caret boundaries, selection, deletion, controlled updates |

## 1. fluent-measures

Package: `@afahy/fluent-measures`. Reviewed commit: `f33bad36bc0888e1f483840fa7a6a6acd328c7cc`.

### Similarity

Parses everyday height and weight descriptions, including attached units, feet/inches, written-out numbers, and optional fuzzy unit matching. Results preserve raw text and component matches. A normalization option converts the result to a selected unit.

Sources: [project overview](https://github.com/afahy/fluent-measures), [parser](https://github.com/afahy/fluent-measures/blob/f33bad36bc0888e1f483840fa7a6a6acd328c7cc/src/parseMeasurement.ts), [unit matching](https://github.com/afahy/fluent-measures/blob/f33bad36bc0888e1f483840fa7a6a6acd328c7cc/src/matchUnit.ts).

### Observed differences

The parser scans for measurements rather than requiring every token to belong to the returned value. Direct probes returned a height for `180 cm garbage` and for `180 cm 70 kg`, ignoring the trailing content. `0 kg` and `-5 kg` returned `null`. `5'11"` returned `71 in`; `1,8 m` returned `1.8 m`; `5-7 ft` returned `null`.

Its anthropometric assumptions are narrower than Quanto's generic dimensions. Its `null` failure result also lacks Quanto's structured issues.

### Lessons for Quanto

- Define full consumption for field parsing. If prose extraction is added, give it a separate explicit contract and report the consumed span.
- Do not embed positive-height/weight assumptions in generic numeric parsing. Leave domain constraints to the supplied schema.
- Preserve component boundaries internally so unrelated measurements cannot accidentally become one sum.
- Treat fuzzy matching as a separately specified feature. Exact aliases are a simpler starting point, especially for short unit symbols.
- Specify how hyphens interact with shorthand heights, negative signs, and ranges. Borrow categories of regression cases, not its context-specific answers.

Useful fixture references: [hyphen regressions](https://github.com/afahy/fluent-measures/blob/f33bad36bc0888e1f483840fa7a6a6acd328c7cc/tests/parseMeasurement.hyphenReview.test.ts), [comma-group validation](https://github.com/afahy/fluent-measures/blob/f33bad36bc0888e1f483840fa7a6a6acd328c7cc/tests/parseMeasurement.commaGroups.test.ts).

## 2. units-and-measurement

Package: `@adam-rocska/units-and-measurement`. Reviewed commit: `5530652ee362851e1e9c793fe7d79735a77fc044`.

### Similarity

Supports string, tuple, object, and dimension measurements; custom conversion rules; arithmetic; and comparisons. Compatible operands are converted to the first operand's unit. Affine conversions use `base = value * coefficient + constant`, with the inverse `(base - constant) / coefficient`.

Sources: [usage guide](https://github.com/adam-rocska/units-and-measurement-typescript/blob/5530652ee362851e1e9c793fe7d79735a77fc044/docs/usage.md), [conversion functions](https://github.com/adam-rocska/units-and-measurement-typescript/blob/5530652ee362851e1e9c793fe7d79735a77fc044/src/dimension/conversion.ts).

### Observed differences

Its measurements are not interchangeable with Quanto's proposed plain records. Object measurements use property descriptors; dimension measurements inherit measurement properties and expose enumerable conversion getters. A direct probe serialized an object measurement as `{}` and encountered a stack overflow when serializing a dimension measurement with recursive conversion getters.

Sources: [object representation](https://github.com/adam-rocska/units-and-measurement-typescript/blob/5530652ee362851e1e9c793fe7d79735a77fc044/src/object/measurement.ts), [dimension representation](https://github.com/adam-rocska/units-and-measurement-typescript/blob/5530652ee362851e1e9c793fe7d79735a77fc044/src/dimension/measurement.ts), [conversion getters](https://github.com/adam-rocska/units-and-measurement-typescript/blob/5530652ee362851e1e9c793fe7d79735a77fc044/src/dimension/alternatives.ts).

### Lessons for Quanto

- Retain ordinary `{ value, unit }` records and standalone conversion functions.
- Require fixtures that perform `JSON.parse(JSON.stringify(value))` and then operate on the restored value without rehydration.
- Document Quanto's affine formula explicitly: `base = value * factor + offset`.
- Keep dimension context explicit when converting restored records. Serialization should not remove information that operations implicitly depend on.
- Preserve Quanto's explicit runtime errors for invalid operation inputs rather than adopting this project's `undefined` convention for incompatibility.

## 3. i-input

Package: `i-input`. Reviewed commit: `0df011d3ce6374629626f6a47f87859e6aa36562`.

### Similarity

A styled React component and headless hook share editing behavior. It supports custom unit systems, compound quantities, expression evaluation, and configurable display formatting. Editing text is distinct from the controlled number; Enter, Tab, and blur commit, while Escape ends editing without committing the draft.

Sources: [overview and API](https://github.com/FarazzShaikh/i-input/blob/0df011d3ce6374629626f6a47f87859e6aa36562/README.md), [hook](https://github.com/FarazzShaikh/i-input/blob/0df011d3ce6374629626f6a47f87859e6aa36562/package/src/useIInput.ts).

### Observed differences

Units are preprocessed into numeric expressions. The following direct probes demonstrate boundaries of this approach:

| Probe | Observed result |
|---|---|
| `3ft 2in` | Evaluates to about `0.9652` in base meters |
| `3ft2in` | Fails to evaluate |
| `1,8 m` | Fails to evaluate |
| `1m * 1m` | Evaluates to bare numeric `1`; the resulting area dimension is not retained |
| `-5ft 11in` | Evaluates as negative five feet plus positive eleven inches |
| Format `71.9999 in` into feet/inches, final precision 2 | Produces `5' 12"` rather than carrying into six feet |

These probes target the preprocessing/evaluation helpers and formatter, not a mounted React component. Hook inspection shows that invalid commits end editing without emitting a new number; there is no persisted raw/issues envelope equivalent to Quanto's.

Sources: [unit preprocessing and compound formatting](https://github.com/FarazzShaikh/i-input/blob/0df011d3ce6374629626f6a47f87859e6aa36562/package/src/utils/units.ts), [expression evaluator](https://github.com/FarazzShaikh/i-input/blob/0df011d3ce6374629626f6a47f87859e6aa36562/package/src/utils/evaluateExpression.ts).

### Lessons for Quanto

- Use a headless adapter or equivalent reusable editing logic beneath the component.
- Define incomplete drafts, failed commits, cancellation, and external-value updates independently from formatting.
- Preserve invalid raw input and its issues according to an explicit policy; do not silently revert a failed edit by accident.
- Define whether a leading minus applies to an entire compound value or only its first component.
- Carry rounded compound remainders into larger units.
- Keep dimension information until the result is constructed. If expressions are supported, specify allowed operators without accidentally introducing dimensional algebra.
- Specify alias collisions. The README says later custom definitions win, but a duplicate-`m` probe still used the original definition. Quanto should test its chosen collision policy directly.

## 4. UnitMath

Package: `unitmath`. Reviewed commit: `53b664e3d0d5cc1b8af070da319d0c2fa179c0db`.

### Similarity and differences

Provides immutable unit conversion, custom unit definitions, arithmetic, and formatting. It also supports dimensional algebra, compound units, and custom numeric implementations, beyond Quanto's intended scope. Values carry operations rather than being Quanto-style plain records.

### Lessons for Quanto

Its unit-splitting implementation handles near-integer values before truncation and cleans up tiny residuals by comparing reconstructed totals. This avoids displaying an exact-looking six feet as five feet plus nearly twelve inches after conversion drift. Quanto should use such handling in presentation without rounding stored values.

Sources: [splitting and formatting implementation](https://github.com/ericman314/UnitMath/blob/53b664e3d0d5cc1b8af070da319d0c2fa179c0db/src/Unit.ts), [definition validation and alias collisions](https://github.com/ericman314/UnitMath/blob/53b664e3d0d5cc1b8af070da319d0c2fa179c0db/src/UnitStore.ts).

Define absolute/relative tolerances for numerical round trips and comparisons used in fixtures. Validate custom definitions early, including alias conflicts, a valid base unit, finite nonzero factors, and finite offsets. Scientific libraries may accept nonfinite values; Quanto's JSON-safe contract should explicitly reject them.

## 5. js-quantities

Package: `js-quantities`. Reviewed commit: `7116174b999500608c303cb101bbeed33bf867c0`.

### Similarity and differences

Parses quantities and supports conversion, arithmetic, and compatibility checks, using `Qty` instances and scientific unit expressions. Direct probes accepted `0 kg` and `-5 kg`, but rejected `5'11"`, `5 ft 11 in`, and `1,8 m`. A comment in the parser mentions compound feet/inches support; the observed implementation did not accept those inputs. Treat executable fixtures as stronger evidence than comments.

Sources: [parser](https://github.com/gentooboontoo/js-quantities/blob/7116174b999500608c303cb101bbeed33bf867c0/src/quantities/parse.js), [built artifact used for probes](https://github.com/gentooboontoo/js-quantities/blob/7116174b999500608c303cb101bbeed33bf867c0/build/quantities.mjs).

### Lessons for Quanto

It distinguishes absolute temperatures from differences: adding two absolute temperatures throws, while subtracting `10 tempC` from `20 tempC` returns `10 degC`. Quanto currently refuses addition and subtraction of absolute temperatures. Keep that initial scope explicit; a future temperature-difference type would need scale-only conversion and separate operation rules.

It also distinguishes physical equality after normalization from identical scalar/unit representation. Use physical equivalence for conversion and formatting fixtures, while using structural equality for storage-preservation fixtures.

Sources: [temperature operations](https://github.com/gentooboontoo/js-quantities/blob/7116174b999500608c303cb101bbeed33bf867c0/src/quantities/operators.js), [comparators](https://github.com/gentooboontoo/js-quantities/blob/7116174b999500608c303cb101bbeed33bf867c0/src/quantities/comparators.js).

## 6. @internationalized/number

### Similarity and differences

Adobe's parser handles locale-aware numbers, percentages, currencies, and unit values, including Unicode numbering systems. It offers a separate `isValidPartialNumber` check. The expected format and unit are supplied up front; it is deliberately stricter than a general human-quantity parser. Partial unit names are not accepted by its partial-number validator.

Source: [official NumberParser documentation](https://react-aria.adobe.com/internationalized/number/NumberParser).

### Lessons for Quanto

Use the documented cases as a reference for localized digits, signs, spaces, grouping, and accounting notation. Quanto's permissive separator rules remain its own policy. Partial quantity input includes unit prefixes and compound components, so numeric partial validation alone is insufficient. Any dependency evaluation must also account for Quanto's no-runtime-dependencies goal and its no-rounding-during-parsing policy.

## 7. react-number-format

Package: `react-number-format`. Reviewed commit: `503a85ea16c182a114731405f6a504d7e86a5dcb`.

### Similarity and differences

Formats numeric input while editing and exposes formatted text, a numeric string, and a numeric value. It manages caret boundaries, selection, deletion, and update origin. Its focus is constrained formatted editing rather than understanding arbitrary measurement text.

Sources: [overview](https://s-yadav.github.io/react-number-format/docs/intro/), [input/caret implementation](https://github.com/s-yadav/react-number-format/blob/503a85ea16c182a114731405f6a504d7e86a5dcb/src/number_format_base.tsx), [value and event types](https://github.com/s-yadav/react-number-format/blob/503a85ea16c182a114731405f6a504d7e86a5dcb/src/types.ts).

### Lessons for Quanto

Keep editing text stable and format on blur as planned. Show interpretation separately. If live rewriting is introduced, budget for caret/selection tests rather than treating it as a formatter option. Preserve raw text separately from numbers, and distinguish user commits from parent-provided value updates to avoid feedback loops.

## Decisions to resolve before implementation

These questions should be resolved in `DESIGN.md` and fixtures; this research does not resolve them by itself.

1. **Consumption and ambiguity:** must all non-whitespace input be understood? What happens with unknown text, mixed dimensions, conflicting units, and shorthand that resembles a range?
2. **Draft lifecycle:** how are empty, incomplete, and invalid text represented? What happens on failed blur/Enter commits, Escape, and external updates during editing? An optional inspection method versus an expanded `ParseResult` remains an API choice.
3. **Merge recognition versus validation:** currently `parse` performs schema validation and `mergeTypes` tries the first successful parse. A recognized-but-invalid length could fall through to another type or the text fallback. Decide whether recognition should select the type before validation, and how that outcome is exposed.
4. **Numerical equivalence:** define the meaning of `parse(format(v)) ≈ v`, including formatter precision, compound carry, negative compounds, and tolerance near zero or unit boundaries.
5. **Definition integrity:** specify alias and type-ID collision rules, factor/offset validation, and case sensitivity where unit symbols differ by case.
6. **Serializable values:** require JSON round-trip fixtures, finite quantity values, and safe integer money values, including overflow checks after operations.

## Suggested fixture groups

- Complete fields versus extraction: `180 cm garbage`, `180 cm 70 kg`, unknown suffixes, and unrelated numeric fragments.
- Numeric forms: zero, negatives, fractions, exponents, malformed numbers, nonfinite/overflow results, and signed compounds.
- Unit boundaries: `3ft 2in`, `3ft2in`, smart quotes, prime marks, overlapping aliases, and alias collisions.
- Locale: Arabic digits, localized signs, decimal commas, thin/nonbreaking spaces, Indian grouping, and ambiguous three-digit fractions.
- Ranges: `5-7 ft`, `5-11`, negative endpoints, ISO-date hyphens, and shared endpoint context.
- Formatting: exact boundaries, near-integer drift, rounding from inches to feet or minutes to hours, and physical equivalence across units.
- Serialization: quantities, money, ranges, tagged merged values, and stored envelopes survive JSON restoration without rehydration.
- UI: incomplete drafts, invalid commits, Escape, Enter/blur duplication, external updates, caret preservation, and input-method composition.

The dates, relative-time context, money allocation, and generic shared-context range design are not substantially evaluated by this set of projects. Research those independently when implementing them.
