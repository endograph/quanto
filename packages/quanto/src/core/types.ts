import type { Locale } from '../locale';
import type { StandardSchemaV1 } from './standard-schema';

/** Metadata that lets wrappers such as `range()` pick a completion strategy. */
export type CodecKind = 'quantity' | 'money' | 'date' | 'time' | 'localDateTime' | 'dateTime';

/**
 * A parser and formatter for values of type `T`. Build one with `defineCodec`.
 *
 * Store what a person entered as `{ raw, value }` (see `QuantoValue`). `value` is authoritative:
 * never re-parse `raw` to get it back.
 */
export interface Codec<T> {
  /** Identifies the codec, e.g. `'length'`. Used to tag `merge()` results. */
  readonly id: string;
  readonly kind?: CodecKind | undefined;
  /**
   * Parses text a person typed. Never throws on bad input: failures come back as `issues`.
   * Omit `ctx.now` in a browser; on a server parsing for a user, pass their `locale` and `now`.
   */
  parse(text: string, ctx?: Ctx): ParseResult<T>;
  /**
   * Formats a value for display. Throws on a malformed value (one that fails the codec's structural
   * check); use `formatWithFallback` to display data that may be malformed.
   */
  format(value: T, ctx?: Ctx): string;
  /**
   * Validates a structured `T`: the codec's structural check, then the user's `schema`.
   *
   * Servers validate stored values with this and store its output. They never parse `raw`.
   */
  readonly schema: StandardSchemaV1<T, T>;
}

/**
 * The result of `codec.parse`.
 *
 * On success, store `{ raw, value }`. `context` is optional extra: keep it separately, and only if
 * you need to replay the parse later (`codec.parse(raw, context)`).
 */
export type ParseResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
      /** What the parse was based on. Optional to store; needed only for replay. */
      readonly context: ParseContext;
      /** Set only by `merge()`: values from later codecs that also parsed. A hint; never store it. */
      readonly alternatives?: readonly T[] | undefined;
    }
  | { readonly ok: false; readonly issues: readonly Issue[] };

/** What a codec's own `parse` returns to `defineCodec`: no `context`, no `alternatives`. */
export type ParseOutcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly Issue[] };

/** Context for parsing and formatting. Every field is optional. */
export interface Ctx {
  /** BCP 47 tag. Missing → `en-US`. */
  readonly locale?: string | undefined;
  /** RFC 3339 timestamp with a UTC offset. Missing → the machine's clock and local offset. */
  readonly now?: string | undefined;
}

/**
 * The context a parse was based on, whether passed in or inferred. Passing it back as `ctx`
 * reproduces the value on the same quanto version.
 *
 * It is not part of the stored envelope. Store it separately, and only if you need replay
 * (audits, debugging, migrations).
 */
export interface ParseContext {
  /** Always present: the canonicalized `ctx.locale`, or `'en-US'`. */
  readonly locale: string;
  /** Present only if the parse read the clock. */
  readonly now?: string | undefined;
}

/** The context a codec's `parse` and `format` receive from `defineCodec`. */
export interface ResolvedCtx {
  /** The resolved bundled data for `ctx.locale`. */
  readonly locale: Locale;
  /**
   * `ctx.now`, or the machine's clock and local offset, as an RFC 3339 string. Always read the time
   * through this: it records `now` in the result's `context`.
   */
  now(): string;
}

export type IssueCode =
  | 'empty' //            input is empty or whitespace only
  | 'unparseable' //      text could not be understood at all
  | 'missing_unit' //     a bare number, and the codec has no default unit
  | 'unknown_unit' //     a unit was written but isn't in the codec's unit table
  | 'missing_currency' // a bare number, and the codec has no default currency
  | 'unknown_currency' // a currency was written but isn't known
  | 'excess_precision' // more decimals than the value allows ("$3.459")
  | 'invalid'; //         the user's schema rejected the value (or, server-side, the structural check did)

/** A Standard Schema–shaped issue with a `code`. `message` is English; localize by `code`. */
export interface Issue {
  readonly code: IssueCode;
  readonly message: string;
  readonly path?: readonly PropertyKey[] | undefined;
  /** Set by `merge()`: the id of the codec that reported it. */
  readonly codec?: string | undefined;
}

/**
 * The stored envelope for a value a person entered.
 *
 * - `value` is authoritative. Read it, compute with it, send it to the server.
 * - `raw` is what was typed (or `format(value)` for a picker or default). Keep it for re-editing and audits.
 * - Never re-parse `raw` to get the value back: relative input (`tomorrow`) would change.
 * - The issues branch is for form state and drafts; usually a submit is blocked instead.
 */
export type QuantoValue<T> = { readonly raw: string; readonly value: T } | { readonly raw: string; readonly issues: readonly Issue[] };

/** Options every codec factory accepts. Codec-specific options extend it. */
export interface CodecOptions<T> {
  /**
   * A synchronous Standard Schema from `T` to `T`. `parse` runs it and keeps its output, so it may
   * normalize as well as validate. Transforms must be idempotent: the schema runs again on values
   * that already went through it.
   */
  readonly schema?: StandardSchemaV1<T, T> | undefined;
  /** Replaces the codec's default formatter. Should round-trip through `parse`. */
  readonly format?: ((value: T, ctx: ResolvedCtx) => string) | undefined;
}

/** A number and a unit from a codec's unit table. */
export interface Quantity<U extends string = string> {
  readonly value: number;
  readonly unit: U;
}

/** An amount in the currency's minor unit (cents for USD), never a float. */
export interface Money<C extends string = string> {
  readonly minorUnits: number;
  /** ISO 4217 code. */
  readonly currency: C;
}
