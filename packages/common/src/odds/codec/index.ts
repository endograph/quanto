import { defineCodec, formatNumber, normalize, readNumber, readNumberToken, type Codec, type CodecOptions, type Issue, type ParseOutcome, type ResolvedCtx } from 'quanto';
import { convert, oddsProblem } from '../operations';
import type { Odds, OddsKind } from '../types';

/** Options for the odds codec. */
export interface OddsOptions<K extends OddsKind = OddsKind> extends CodecOptions<Extract<Odds, { readonly kind: K }>> {
  /**
   * Always store odds in this notation, converting what was typed. It also says what a bare whole number
   * of 100 or more means, which is otherwise ambiguous: `150` is +150 in an American field and 150.0 in a
   * decimal one.
   */
  readonly canonicalKind?: K | undefined;
}

/** `evens`, `evs`, `even money`: 1/1. */
const EVENS = /^(?:evens|evs|even money)$/;
/** `5/1`, `5-1`, `5:1`, `5 to 1`, then `on` (reversed) or `against`. */
const FRACTIONAL = /^(\d+)\s*(?:\/|-|:|\s+to\s+)\s*(\d+)(?:\s+(on|against))?$/;
const PERCENT = /^\s*(?:%|percent|per cent)$/;
/** A trailing `odds` (`5/1 odds`, `+275 odds`): it says the text is odds, and nothing else reads it. */
const ODDS_WORD = /\s+odds$/i;

const unparseable = (message: string): ParseOutcome<Odds> => ({ ok: false, issues: [{ code: 'unparseable', message }] });

/** The reading of the text, before any conversion, or the issue. Several readings are ambiguous. */
function read(text: string, ctx: ResolvedCtx, canonicalKind: OddsKind | undefined): Odds[] | Issue {
  const s = normalize(text).trim().toLowerCase();
  const fail = (message: string): Issue => ({ code: 'unparseable', message });
  if (EVENS.test(s)) return [{ kind: 'fractional', numerator: 1, denominator: 1 }];
  const fraction = FRACTIONAL.exec(s);
  if (fraction) {
    const [n, d] = [Number(fraction[1]), Number(fraction[2])];
    if (n === 0 || d === 0 || !Number.isSafeInteger(n) || !Number.isSafeInteger(d)) return fail(`Odds like "${s}" need two whole numbers above 0, like "5/1".`);
    return [fraction[3] === 'on' ? { kind: 'fractional', numerator: d, denominator: n } : { kind: 'fractional', numerator: n, denominator: d }];
  }
  const n = readNumber(s, ctx);
  const written = n ? s.slice(0, n.end) : '';
  // A fraction or expression as the number ("2.5/1", "1/2" read as 0.5) isn't odds.
  if (!n || /[/^*×]/.test(written)) return fail(`Couldn't understand "${text}" as odds, like "5/1", "6.0" or "+500".`);
  const rest = s.slice(n.end);
  if (PERCENT.test(rest)) {
    if (!(n.value > 0 && n.value < 100)) return fail('An implied probability is between 0% and 100%.');
    return [{ kind: 'decimal', value: 100 / n.value }];
  }
  if (rest.trim() !== '') return fail(`Couldn't understand "${text}" as odds, like "5/1", "6.0" or "+500".`);
  if (/^[+-]/.test(written)) {
    if (Math.abs(n.value) < 100) return fail('American odds are +100 or more, or -100 or less.');
    return [{ kind: 'american', value: n.value }];
  }
  if (n.value <= 1) return fail('Decimal odds are above 1: 1.0 would return only the stake.');
  // A bare whole number of 100 or more reads as American (+150) or decimal (150.0), unless the field says
  // which. Written with a decimal point (150.0), it's decimal.
  const token = readNumberToken(s, ctx);
  const whole = token?.kind === 'decimal' && token.frac === '' && token.exponent === 0;
  if (whole && n.value >= 100) {
    if (canonicalKind === 'american' || canonicalKind === 'decimal') return [{ kind: canonicalKind, value: n.value }];
    return [{ kind: 'american', value: n.value }, { kind: 'decimal', value: n.value }];
  }
  return [{ kind: 'decimal', value: n.value }];
}

/**
 * Betting odds in any notation: fractional (`5/1`, `11/4`, `5 to 1`, `2/1 on`, `evens`), decimal (`6.0`,
 * `3.75`) or American (`+500`, `-200`), and implied probability (`25%`, stored as decimal), each optionally
 * followed by `odds` (`5/1 odds`), which settles it in a merge where a date or number would read it. The
 * value keeps the notation as written, unless `canonicalKind` is set. A bare whole number of 100 or more
 * (`150`) is `ambiguous`, with the American and decimal readings as alternatives. Formats in the value's
 * notation: `11/4`, `3.75`, `+275`.
 */
export function odds<K extends OddsKind = OddsKind>(options?: OddsOptions<K>): Codec<Extract<Odds, { readonly kind: K }>> {
  const canonicalKind = options?.canonicalKind;
  if (canonicalKind !== undefined && !['fractional', 'decimal', 'american'].includes(canonicalKind)) {
    throw new Error(`quanto: canonicalKind of codec "odds" must be "fractional", "decimal" or "american"; got "${String(canonicalKind)}".`);
  }
  type V = Extract<Odds, { readonly kind: K }>;
  const parse = (text: string, ctx: ResolvedCtx): ParseOutcome<V> => {
    const written = text.trim().replace(ODDS_WORD, '');
    const readings = read(written, ctx, canonicalKind);
    if (!Array.isArray(readings)) return { ok: false, issues: [readings] };
    const values = readings.map((r) => (canonicalKind ? convert(r, canonicalKind) : r) as V);
    if (values.length === 1) return { ok: true, value: values[0]! };
    return {
      ok: false,
      issues: [{ code: 'ambiguous', message: `"${written}" could be American odds or decimal odds. Write +${written} for American, or ${written}.0 for decimal.` }],
      alternatives: values,
    };
  };
  return defineCodec<V>({
    id: 'odds',
    parse,
    format: (v, ctx) => {
      const value = v as Odds;
      switch (value.kind) {
        case 'fractional':
          return `${value.numerator}/${value.denominator}`;
        case 'decimal':
          return formatNumber(value.value, ctx, { minFractionDigits: 2 });
        case 'american':
          return `${value.value > 0 ? '+' : ''}${formatNumber(value.value, ctx)}`;
      }
    },
    check: (value) => {
      const problem = oddsProblem(value);
      if (problem) return [{ message: problem }];
      if (canonicalKind !== undefined && (value as Odds).kind !== canonicalKind) return [{ message: `Expected kind "${canonicalKind}".`, path: ['kind'] }];
      return [];
    },
    options,
  });
}
