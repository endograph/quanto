import { defineCodec } from '../../core/define-codec';
import type { Codec, CodecOptions } from '../../core/types';

/**
 * Plain text: the value is what was typed, trimmed, with no other parsing. Blank input is an `empty`
 * issue, as for every codec; wrap it in `optional` to allow it. Use `schema` to validate (a pattern,
 * a length). It's what a quanto field with no other codec uses.
 */
export const text = (options?: CodecOptions<string>): Codec<string> =>
  defineCodec<string>({
    id: 'text',
    parse: (value) => ({ ok: true, value }),
    format: (value) => value,
    check: (value) => (typeof value === 'string' && value.trim() === value && value !== '' ? [] : [{ message: 'Expected non-empty text with no surrounding spaces.' }]),
    options,
  });
