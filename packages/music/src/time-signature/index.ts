import { defineCodec, normalize, type Codec, type CodecOptions, type ParseOutcome } from 'quanto';

/** A time signature: `6/8` is `{ numerator: 6, denominator: 8 }`; an additive one keeps its groups (`3+2+2/8`). */
export interface TimeSignature {
  readonly numerator: number;
  /** A note value: 1, 2, 4, 8, 16, 32 or 64. */
  readonly denominator: number;
  /** How an additive meter groups its beats, summing to `numerator`: `[3, 2, 2]` for `3+2+2/8`. */
  readonly groups?: readonly number[] | undefined;
}

const NOTE_VALUES: ReadonlySet<number> = new Set([1, 2, 4, 8, 16, 32, 64]);

const COMMON = /^(?:common(?: time)?|c|𝄴)$/iu;
const CUT = /^(?:cut(?: common)?(?: time)?|alla breve|𝄵)$/iu;
const NUMERIC = /^(\()?(\d+(?: ?\+ ?\d+)*)(\))? ?\/ ?(\d+)(?: time)?$/i;

const unparseable = (text: string, hint?: string): ParseOutcome<never> => ({
  ok: false,
  issues: [{ code: 'unparseable', message: `Couldn't understand "${text}".${hint ? ` ${hint}` : ''}` }],
});

/**
 * Time signatures: `4/4`, `6/8`, `3/4 time`, additive meters (`3+2+2/8`), and `C`, `common time`,
 * `cut time`, `alla breve`, `𝄴` and `𝄵`. The bottom number is a note value (1 to 64), so `4/3` is
 * rejected. Formats as `6/8` and `3+2+2/8`; common time prints as `4/4`.
 */
export const timeSignature = (options?: CodecOptions<TimeSignature>): Codec<TimeSignature> =>
  defineCodec<TimeSignature>({
    id: 'timeSignature',
    options,
    parse(raw) {
      const text = normalize(raw).trim();
      if (COMMON.test(text)) return { ok: true, value: { numerator: 4, denominator: 4 } };
      if (CUT.test(text)) return { ok: true, value: { numerator: 2, denominator: 2 } };
      const match = NUMERIC.exec(text);
      if (!match || Boolean(match[1]) !== Boolean(match[3])) return unparseable(text, 'Write it like 3/4 or 6/8.');
      const groups = match[2]!.split('+').map((g) => Number(g.trim()));
      const denominator = Number(match[4]);
      if (groups.some((g) => g < 1)) return unparseable(text, 'The top number is a count of beats, more than 0.');
      if (!NOTE_VALUES.has(denominator)) return unparseable(text, 'The bottom number is a note value: 1, 2, 4, 8, 16, 32 or 64.');
      const numerator = groups.reduce((a, b) => a + b, 0);
      return { ok: true, value: groups.length > 1 ? { numerator, denominator, groups } : { numerator, denominator } };
    },
    format: (value) => `${value.groups ? value.groups.join('+') : value.numerator}/${value.denominator}`,
    check(value) {
      const v = value as TimeSignature | null;
      const count = (n: unknown): boolean => Number.isInteger(n) && (n as number) >= 1;
      if (!v || typeof v !== 'object' || !count(v.numerator)) return [{ message: 'Expected { numerator, denominator } with a whole numerator of at least 1.' }];
      if (!NOTE_VALUES.has(v.denominator)) return [{ message: 'Expected a denominator of 1, 2, 4, 8, 16, 32 or 64.', path: ['denominator'] }];
      if (v.groups !== undefined) {
        if (!Array.isArray(v.groups) || v.groups.length < 2 || !v.groups.every(count) || v.groups.reduce((a, b) => a + b, 0) !== v.numerator) {
          return [{ message: 'Expected groups of at least two whole counts that sum to the numerator.', path: ['groups'] }];
        }
      }
      return [];
    },
  });
