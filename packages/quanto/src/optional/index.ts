import { startSession } from '../core/context';
import { isExternalCodec } from '../core/define-external-codec';
import type { StandardSchemaV1 } from '../core/standard-schema';
import type { Codec, Ctx, ExternalCodec, ExternalParseResult, ParseResult } from '../core/types';

/**
 * Allows empty input: `''` and whitespace parse to `null`, and `null` formats as `''`. Keeps the
 * inner codec's `id`. It's the one wrapper that also takes an external codec, since it never parses:
 * empty input doesn't reach the service.
 */
export function optional<T>(codec: ExternalCodec<T>): ExternalCodec<T | null>;
export function optional<T>(codec: Codec<T>): Codec<T | null>;
export function optional<T>(codec: Codec<T> | ExternalCodec<T>): Codec<T | null> | ExternalCodec<T | null> {
  const empty = (ctx: Ctx | undefined): ParseResult<T | null> => ({ ok: true, value: null, context: startSession(ctx).context() });
  const isEmpty = (text: string): boolean => text.trim() === '';

  const format = (value: T | null, ctx?: Ctx): string => (value === null ? '' : codec.format(value, ctx));

  const schema: StandardSchemaV1<T | null, T | null> = {
    '~standard': {
      version: 1,
      vendor: 'quanto',
      validate: (value: unknown) => (value === null ? { value: null } : codec.schema['~standard'].validate(value)),
    },
  };

  if (isExternalCodec(codec)) {
    const external = codec;
    const parse = async (text: string, ctx?: Ctx): Promise<ExternalParseResult<T | null>> => {
      if (ctx?.signal?.aborted) throw ctx.signal.reason;
      return isEmpty(text) ? empty(ctx) : external.parse(text, ctx);
    };
    return {
      external: true, id: external.id, parse, format, schema,
      ...(external.complete ? { complete: (text: string, ctx?: Ctx) => external.complete!(text, ctx) } : {}),
    };
  }

  const sync = codec;
  const parse = (text: string, ctx?: Ctx): ParseResult<T | null> => (isEmpty(text) ? empty(ctx) : sync.parse(text, ctx));
  return { id: sync.id, parse, format, schema };
}
