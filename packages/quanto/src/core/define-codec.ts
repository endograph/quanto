import { startSession } from './context';
import { InvalidValueError, isInvalidValueError } from './errors';
import type { StandardSchemaV1 } from './standard-schema';
import type { Codec, CodecOptions, Ctx, Issue, ParseOutcome, ParseResult, ResolvedCtx } from './types';

/** A problem reported by a codec's structural check. */
export interface CheckProblem {
  readonly message: string;
  readonly path?: readonly PropertyKey[] | undefined;
}

/** What a codec author supplies to `defineCodec`. */
export interface CodecDefinition<T> {
  /** Letters, digits, `_`, `-` and `.`. Parentheses and commas are reserved for derived ids. */
  readonly id: string;
  /** Receives trimmed, non-empty text. Never throw on bad input: return issues. */
  parse(text: string, ctx: ResolvedCtx): ParseOutcome<T>;
  /** The default formatter. */
  format(value: T, ctx: ResolvedCtx): string;
  /** The structural check: returns problems, empty when `value` is a well-formed `T`. */
  check(value: unknown): readonly CheckProblem[];
  /** The caller's options, passed through. */
  readonly options?: CodecOptions<T> | undefined;
}

const ID = /^[A-Za-z0-9_.-]+$/;

/** Validates a codec id at definition time. */
export function assertCodecId(id: string): void {
  if (!ID.test(id)) {
    throw new Error(
      `quanto: codec id "${id}" is invalid. Use letters, digits, "_", "-" and "."; parentheses and commas are reserved for derived ids such as "merge(length,mass)".`,
    );
  }
}

const toPath = (path: StandardSchemaV1.Issue['path']): PropertyKey[] | undefined =>
  path?.map((segment) => (typeof segment === 'object' && segment !== null ? segment.key : segment));

/**
 * Runs a user schema synchronously. Returns the schema's output or `invalid` issues; throws if the
 * schema is async, which v1 doesn't support.
 */
export function runUserSchema<T>(
  schema: StandardSchemaV1<T, T>,
  value: T,
  codecId: string,
): { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly Issue[] } {
  const result = schema['~standard'].validate(value);
  if (result instanceof Promise) {
    throw new Error(
      `quanto: the schema passed to codec "${codecId}" is async. quanto v1 supports only synchronous schemas; async schemas arrive with async codecs in v2.`,
    );
  }
  if (result.issues) {
    return {
      ok: false,
      issues: result.issues.map((issue): Issue => {
        const path = toPath(issue.path);
        return path?.length ? { code: 'invalid', message: issue.message, path } : { code: 'invalid', message: issue.message };
      }),
    };
  }
  return { ok: true, value: result.value };
}

/**
 * Defines a codec. The author supplies what is specific to the value; `defineCodec` supplies what
 * every codec does the same way: empty input, context resolution, the structural check, the user's
 * schema, the parse `context`, the `format` override and the composed `schema`.
 */
export function defineCodec<T>(definition: CodecDefinition<T>): Codec<T> {
  const { id, options } = definition;
  assertCodecId(id);
  const userSchema = options?.schema;
  const formatter = options?.format ?? definition.format;

  const parse = (text: string, ctx?: Ctx): ParseResult<T> => {
    const trimmed = text.trim();
    if (trimmed === '') return { ok: false, issues: [{ code: 'empty', message: 'Enter a value.' }] };
    const session = startSession(ctx);
    const outcome = definition.parse(trimmed, session.ctx);
    if (!outcome.ok) return outcome;
    const problems = definition.check(outcome.value);
    if (problems.length > 0) {
      throw new Error(
        `quanto: codec "${id}" parsed ${JSON.stringify(trimmed)} into a value its own check rejects (${problems[0]!.message}). This is a bug in the codec's parse or check.`,
      );
    }
    let value = outcome.value;
    if (userSchema) {
      const validated = runUserSchema(userSchema, value, id);
      if (!validated.ok) return validated;
      value = validated.value;
    }
    return { ok: true, value, context: session.context() };
  };

  const format = (value: T, ctx?: Ctx): string => {
    const problems = definition.check(value);
    if (problems.length > 0) throw new InvalidValueError(id, problems);
    return formatter(value, startSession(ctx).ctx);
  };

  const schema: StandardSchemaV1<T, T> = {
    '~standard': {
      version: 1,
      vendor: 'quanto',
      validate(value: unknown): StandardSchemaV1.Result<T> {
        const problems = definition.check(value);
        if (problems.length > 0) {
          return { issues: problems.map((p) => ({ ...p, code: 'invalid' as const })) };
        }
        if (!userSchema) return { value: value as T };
        const validated = runUserSchema(userSchema, value as T, id);
        return validated.ok ? { value: validated.value } : { issues: validated.issues };
      },
    },
  };

  return { id, parse, format, schema };
}

/**
 * Formats a value that may be malformed (legacy rows, a unit since removed from the table). Returns
 * `fallback` where `format` would throw on a malformed value; any other error still throws.
 */
export function formatWithFallback<T>(codec: Codec<T>, value: unknown, fallback: string, ctx?: Ctx): string {
  try {
    return codec.format(value as T, ctx);
  } catch (error) {
    if (isInvalidValueError(error)) return fallback;
    throw error;
  }
}
