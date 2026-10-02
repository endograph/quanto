import type { Locale } from '../locale';
import type { StandardSchemaV1 } from './standard-schema';

/**
 * A parser and formatter for values of type `T`. Build one with `defineCodec`.
 *
 * Store what a person entered as `{ raw, value }` (see `QuantoValue`). `value` is authoritative:
 * never re-parse `raw` to get it back.
 */
export interface Codec<T> {
  /** Identifies the codec, e.g. `'length'`. Used to tag `merge()` results. */
  readonly id: string;
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
 * A codec whose parse happens outside the field: a model, a server, a worker. Build one with
 * `defineExternalCodec`. Only `parse` is async; `format` and `schema` are sync, like every codec's.
 *
 * An external codec owns its whole parse, so `merge`, `range` and `approx` don't take one: do that
 * inside the service. `optional` does, since it never parses.
 */
export interface ExternalCodec<T> {
  /** Marks the codec as external, for code that accepts either kind. */
  readonly external: true;
  /** Identifies the codec, e.g. `'recipe-yield'`. */
  readonly id: string;
  /**
   * Parses text a person typed. Resolves with `issues` for bad input, like any codec. Rejects when the
   * service can't answer (network error, rate limit, timeout), and with `ctx.signal.reason` when
   * aborted: an outage isn't the user's mistake, so it never becomes issues. Retrying is up to you.
   */
  parse(text: string, ctx?: Ctx): Promise<ExternalParseResult<T>>;
  /**
   * Candidate values for the text as it stands, which may not be finished: what it might become, or a
   * more precise version of it. Present only if the codec completes. An empty list is a normal answer.
   * Rejects when the service can't answer, like `parse`. Completions are offered, never applied: only a
   * person choosing one commits it.
   */
  complete?(text: string, ctx?: Ctx): Promise<readonly Completion<T>[]>;
  /** Formats a value for display. Sync, and throws on a malformed value, like `Codec.format`. */
  format(value: T, ctx?: Ctx): string;
  /** Validates a structured `T`, like `Codec.schema`. Servers validate stored values with it. */
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
      /**
       * Other readings of the same text: from `merge()`'s other codecs, or the codec's own. Choosing
       * one replaces `value` and keeps `raw`. A hint; never store it.
       */
      readonly alternatives?: readonly T[] | undefined;
    }
  | {
      readonly ok: false;
      readonly issues: readonly Issue[];
      /**
       * With an `ambiguous` issue: the readings the codec wouldn't choose between. Choosing one gives
       * `{ raw, value }`, keeping `raw`. A hint; never store it.
       */
      readonly alternatives?: readonly T[] | undefined;
    };

/**
 * What a codec's own `parse` returns to `defineCodec`: no `context`. `alternatives` are other readings
 * of the text: on success, what else it could mean; on failure, with an `ambiguous` issue, the readings
 * the codec won't choose between.
 */
export type ParseOutcome<T> =
  | { readonly ok: true; readonly value: T; readonly alternatives?: readonly T[] | undefined }
  | { readonly ok: false; readonly issues: readonly Issue[]; readonly alternatives?: readonly T[] | undefined };

/**
 * An external codec's parse result: either branch may also carry `completions`. With an `ambiguous`
 * issue, they're the candidates the parse couldn't choose between; on success, refinements of the value.
 */
export type ExternalParseResult<T> = ParseResult<T> & { readonly completions?: readonly Completion<T>[] | undefined };

/** What an external codec's own `parse` returns: a `ParseOutcome`, optionally with `completions`. */
export type ExternalParseOutcome<T> = ParseOutcome<T> & { readonly completions?: readonly Completion<T>[] | undefined };

/**
 * A candidate value for text that may not be finished, from an external codec's `complete` (or its
 * parse, when it couldn't choose). Choosing one is a pick: the text becomes `format(value)`.
 *
 * Either the value is known, or `resolve` fetches it when the completion is chosen (a place's details,
 * say), so a list of candidates doesn't cost a fetch each. Never stored.
 */
export type Completion<T> =
  | { readonly label: string; readonly id?: string | undefined; readonly value: T }
  | {
      readonly label: string;
      readonly id?: string | undefined;
      /** Fetches the value. Rejects when the service can't answer, and with `ctx.signal.reason` when aborted. */
      resolve(ctx?: Ctx): Promise<T>;
    };

/**
 * Settings for codecs from other packages. A package declares its own key by augmenting this interface
 * (`declare module 'quanto' { interface CtxExtensions { readonly music?: MusicCtx } }`), and quanto passes
 * it through to `ResolvedCtx` untouched, so it reaches codecs inside `merge`, `range` and `approx`, and
 * through the React provider. Not recorded in `ParseContext`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CtxExtensions {}

/** Context for parsing and formatting. Every field is optional. */
export interface Ctx extends CtxExtensions {
  /** BCP 47 tag. Missing → `en-US`. */
  readonly locale?: string | undefined;
  /** RFC 3339 timestamp with a UTC offset. Missing → the machine's clock and local offset. */
  readonly now?: string | undefined;
  /**
   * Grammars for other languages, tried before the built-in English one. Opt-in, so an app's fields
   * change only when it passes a different set. Not recorded in `ParseContext`: pass the same
   * grammars to replay a parse.
   */
  readonly grammars?: readonly Grammar[] | undefined;
  /**
   * Cancels an external codec's parse in flight, which then rejects with `signal.reason`. Sync codecs
   * ignore it. Not recorded in `ParseContext`.
   */
  readonly signal?: Signal | undefined;
  /**
   * Identifies a completion session, for services that bill completions and the fetch of the chosen one
   * together (Google's session tokens). The external field sets it: a session starts with the first
   * edit and ends with a commit or a pick. Not recorded in `ParseContext`.
   */
  readonly session?: string | undefined;
}

/**
 * The platform's `AbortSignal` wherever it's declared (DOM or Node types), and otherwise the part of it
 * quanto reads, so the core needs neither.
 */
export type Signal = typeof globalThis extends { readonly AbortSignal: { readonly prototype: infer S } }
  ? S
  : { readonly aborted: boolean; readonly reason: unknown };

/**
 * The way one language writes things codecs read. Each part is optional, and each codec uses the parts
 * it knows: `numbers` is read wherever a number is (`readNumber`, money). English is built in.
 */
export interface Grammar {
  /** The language, as a BCP 47 language subtag (`de`). */
  readonly language: string;
  readonly numbers?: NumberGrammar | undefined;
}

/** Reads numbers written in words: `fünfundzwanzig`, `vingt-cinq`. */
export interface NumberGrammar {
  /**
   * Reads a number in words starting at `from` (normalized text, original case; leading spaces skipped
   * by the caller). Returns the number as plain digit text, which quanto reads exactly: an integer or
   * decimal with a `.` (`-1500.5`), a fraction (`2/3`), or a whole number and a fraction (`2 3/4`). And
   * `end`, the index just past the words. Returns undefined if there's no number there, and should also
   * when the words don't form one number (`two fifty`), so nothing is guessed.
   */
  read(text: string, from: number): { readonly text: string; readonly end: number } | undefined;
}

/**
 * The context a parse was based on, whether passed in or inferred. Passing it back as `ctx`
 * reproduces the value on the same versions of quanto and the package that owns the codec.
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
export interface ResolvedCtx extends CtxExtensions {
  /** The resolved bundled data for `ctx.locale`. */
  readonly locale: Locale;
  /**
   * `ctx.now`, or the machine's clock and local offset, as an RFC 3339 string. Always read the time
   * through this: it records `now` in the result's `context`.
   */
  now(): string;
  /** `ctx.grammars`, or none. */
  readonly grammars: readonly Grammar[];
  /** `ctx.signal`: an external codec passes it to whatever it calls. */
  readonly signal?: Signal | undefined;
  /** `ctx.session`: an external codec passes it to a service that groups calls into sessions. */
  readonly session?: string | undefined;
}

export type IssueCode =
  | 'empty' //            input is empty or whitespace only
  | 'unparseable' //      text could not be understood at all
  | 'missing_unit' //     a bare number, and the codec has no default unit
  | 'unknown_unit' //     a unit was written but isn't in the codec's unit table
  | 'incompatible_unit' // a unit on another scale, which doesn't convert to the one required ("85 dB" where dBA is)
  | 'missing_currency' // a bare number, and the codec has no default currency
  | 'unknown_currency' // a currency was written but isn't known
  | 'excess_precision' // more decimals than the value allows ("$3.459")
  | 'wrong_count' //      a list with more or fewer parts than allowed ("24 × 36 × 10" where two are)
  | 'ambiguous' //        the text reads several ways and the codec won't choose; see `alternatives`
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
   * A synchronous Standard Schema from `T` to `T`, for every codec, external ones included. `parse` runs it and keeps its output, so it may
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

