// Core: defineCodec, the primitives, the wrappers, and the Codec/Issue/value types. See DESIGN.md.

export const VERSION: string = '0.0.0';

export { defineCodec, formatWithFallback } from './core/define-codec';
export type { CheckProblem, CodecDefinition } from './core/define-codec';
export type {
  Codec,
  CodecOptions,
  Ctx,
  Issue,
  IssueCode,
  ParseContext,
  ParseOutcome,
  ParseResult,
  Quantity,
  QuantoValue,
  ResolvedCtx,
} from './core/types';
export type { StandardSchemaV1 } from './core/standard-schema';
export { lookupRegional } from './locale';
export type { Locale, MeasurementSystem } from './locale';
export type { UnitDefinition, UnitTable } from './codecs/quantity';

export { normalize } from './primitives/normalize';
export { formatNumber, readNumber } from './primitives/number';
export type { FormatNumberOptions, LocaleCtx, NumberMatch, ReadNumberOptions } from './primitives/number';

export { optional } from './optional';
export { merge } from './merge';
export type { LeafValue, MergedCodec, Tagged } from './merge';
export { defineRange, range } from './range';
export type { Range, RangeProposal, RangeRules } from './range';
