// The protocol: defineCodec and the other definition helpers, the shared parsing primitives, the
// wrappers, and the Codec/Issue/value types. No codecs: those are in @quantojs/common and the other
// @quantojs packages. See DESIGN.md.

export { defineCodec, formatWithFallback } from './core/define-codec';
export type { CheckProblem, CodecDefinition } from './core/define-codec';
export { defineExternalCodec, isExternalCodec, parseFromCompletions } from './core/define-external-codec';
export type { ExternalCodecDefinition, ParseFromCompletionsOptions } from './core/define-external-codec';
export { isInvalidValueError } from './core/errors';
export type { InvalidValueError } from './core/errors';
export type {
  Codec,
  CodecOptions,
  Completion,
  Ctx,
  CtxExtensions,
  ExternalCodec,
  ExternalParseOutcome,
  ExternalParseResult,
  Grammar,
  Issue,
  IssueCode,
  NumberGrammar,
  ParseContext,
  ParseOutcome,
  ParseResult,
  Quantity,
  QuantoValue,
  ResolvedCtx,
  Signal,
} from './core/types';
export type { StandardSchemaV1 } from './core/standard-schema';
export { lookupRegional } from './locale';
export type { Locale, MeasurementSystem } from './locale';
export { quantity } from './quantity/codec';
export type { DefaultUnit, NumberSyntax, QuantityCodec, QuantityDefinition, QuantityOptions, ToBase, UnitDefinition, UnitTable } from './quantity/codec';

export { normalize } from './primitives/normalize';
export { formatDecimalParts, formatNumber, readNumber, readNumberToken, readWordToken } from './primitives/number';
export type { FormatNumberOptions, LocaleCtx, NumberMatch, NumberToken, ReadNumberOptions } from './primitives/number';

export { optional } from './optional';
export { approx } from './approx';
export type { Approx } from './approx';
export { infinite, isInfinite } from './infinite';
export type { Infinite, InfiniteOptions, WithInfinite } from './infinite';
export { merge } from './merge';
export type { LeafValue, MergedCodec, Tagged } from './merge';
export { dimensions } from './dimensions';
export type { DimensionCount, DimensionsOptions } from './dimensions';
export { defineRange, numberSpan, range } from './range';
export type { OpenRange, Range, RangeOptions, RangeProposal, RangeRules } from './range';
