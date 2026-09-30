import { startSession } from '../core/context';
import type { StandardSchemaV1 } from '../core/standard-schema';
import type { Codec, Ctx, ParseResult } from '../core/types';

/**
 * Allows empty input: `''` and whitespace parse to `null`, and `null` formats as `''`. Keeps the
 * inner codec's `id` and `kind`.
 */
export function optional<T>(codec: Codec<T>): Codec<T | null> {
  const parse = (text: string, ctx?: Ctx): ParseResult<T | null> => {
    if (text.trim() === '') return { ok: true, value: null, context: startSession(ctx).context() };
    return codec.parse(text, ctx);
  };

  const format = (value: T | null, ctx?: Ctx): string => (value === null ? '' : codec.format(value, ctx));

  const schema: StandardSchemaV1<T | null, T | null> = {
    '~standard': {
      version: 1,
      vendor: 'quanto',
      validate: (value: unknown) => (value === null ? { value: null } : codec.schema['~standard'].validate(value)),
    },
  };

  return codec.kind === undefined ? { id: codec.id, parse, format, schema } : { id: codec.id, kind: codec.kind, parse, format, schema };
}
