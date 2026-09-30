// Core: defineCodec, the primitives, the wrappers, and the Codec/Issue/value types. See DESIGN.md.

export const VERSION: string = '0.0.0';

export { defineCodec, formatWithFallback } from './core/define-codec';
export type { CheckProblem, CodecDefinition } from './core/define-codec';
export type {
  Codec,
  CodecKind,
  CodecOptions,
  Ctx,
  Issue,
  IssueCode,
  Money,
  ParseContext,
  ParseOutcome,
  ParseResult,
  Quantity,
  QuantoValue,
  ResolvedCtx,
} from './core/types';
export type { StandardSchemaV1 } from './core/standard-schema';
export type { DateOrder, Locale, MeasurementSystem, Names } from './locale';

export { normalize } from './primitives/normalize';
export { formatNumber, readNumber } from './primitives/number';
export type { FormatNumberOptions, LocaleCtx, NumberMatch, ReadNumberOptions } from './primitives/number';
