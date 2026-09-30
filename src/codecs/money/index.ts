import { defineCodec } from '../../core/define-codec';
import type { Codec, CodecOptions, Money, ParseOutcome, ResolvedCtx } from '../../core/types';
import { normalize } from '../../primitives/normalize';
import { formatNumber, readNumber } from '../../primitives/number';
import { CURRENCY_TOKENS, DISPLAY_SYMBOLS, isKnownCurrency, minorDigits, resolveCandidates } from './currencies';

export { isKnownCurrency, minorDigits } from './currencies';

/** Options for the money codec. */
export interface MoneyOptions extends CodecOptions<Money> {
  /**
   * What a bare number means, and which currency an ambiguous symbol (`$`, `kr`, `¥`) means when
   * this currency uses it. Without it, `12` is a `missing_currency` issue.
   */
  readonly defaultCurrency?: string | undefined;
}

interface Token {
  readonly candidates: readonly string[];
  readonly end: number;
}

const TOKENS: ReadonlyArray<{ readonly key: string; readonly candidates: readonly string[] }> = (() => {
  const all = new Map<string, readonly string[]>();
  for (const [key, candidates] of Object.entries(CURRENCY_TOKENS)) all.set(normalize(key).toLowerCase(), candidates);
  return [...all].map(([key, candidates]) => ({ key, candidates })).sort((a, b) => b.key.length - a.key.length);
})();

const isLetter = (c: string | undefined): boolean => c !== undefined && /\p{L}/u.test(c);

/** Matches a currency symbol, name or ISO code at `at`, not inside a word. */
function matchToken(lower: string, at: number): Token | undefined {
  if (isLetter(lower[at - 1]) && isLetter(lower[at])) return undefined;
  const code = /^[a-z]{3}(?!\p{L})/u.exec(lower.slice(at))?.[0];
  if (code && isKnownCurrency(code.toUpperCase())) return { candidates: [code.toUpperCase()], end: at + 3 };
  for (const { key, candidates } of TOKENS) {
    if (!lower.startsWith(key, at)) continue;
    if (isLetter(key[key.length - 1]) && isLetter(lower[at + key.length])) continue;
    return { candidates, end: at + key.length };
  }
  return undefined;
}

/** Moves a number's decimal point by `places` exactly, via its shortest decimal representation. */
const shiftDecimal = (n: number, places: number): number => {
  const [mantissa, exponent = '0'] = String(n).split('e') as [string, string?];
  return Number(`${mantissa}e${Number(exponent) + places}`);
};

/**
 * Money: `$12`, `12 USD`, `€12,50`, `12.50 eur`, `$1.2k`, `12 bucks`. Amounts are integers in the
 * currency's minor unit (`{ minorUnits: 1234, currency: 'USD' }`).
 */
export function money(options?: MoneyOptions): Codec<Money> {
  const defaultCurrency = options?.defaultCurrency;
  if (defaultCurrency !== undefined && !isKnownCurrency(defaultCurrency)) {
    throw new Error(`quanto: defaultCurrency "${defaultCurrency}" of the money codec isn't a known ISO 4217 code. Use an uppercase code such as "USD".`);
  }

  const unparseable = (text: string): ParseOutcome<Money> => ({
    ok: false,
    issues: [{ code: 'unparseable', message: `Couldn't understand "${text}" as an amount of money.` }],
  });
  const unknownCurrency = (word: string): ParseOutcome<Money> => ({
    ok: false,
    issues: [{ code: 'unknown_currency', message: `"${word}" isn't a currency this field knows.` }],
  });

  const parse = (text: string, ctx: ResolvedCtx): ParseOutcome<Money> => {
    const s = normalize(text);
    const lower = s.toLowerCase();
    let pos = 0;
    const skipSpaces = (): void => {
      while (s[pos] === ' ') pos++;
    };

    // A sign before a prefix symbol: "-$12".
    let negative = false;
    if ((s[0] === '-' || s[0] === '+') && matchToken(lower, 1)) {
      negative = s[0] === '-';
      pos = 1;
    }

    const prefix = matchToken(lower, pos);
    if (prefix) {
      pos = prefix.end;
      skipSpaces();
    } else if (isLetter(s[pos])) {
      const word = /^[\p{L}\p{M}]+/u.exec(s.slice(pos))![0];
      return readNumber(s, ctx, { from: pos + word.length }) ? unknownCurrency(word) : unparseable(text);
    }

    if (negative && (s[pos] === '-' || s[pos] === '+')) return unparseable(text);
    const n = readNumber(s, ctx, { from: pos, suffixes: true });
    if (!n) return unparseable(text);
    pos = n.end;
    skipSpaces();

    const suffix = pos < s.length ? matchToken(lower, pos) : undefined;
    if (suffix) {
      pos = suffix.end;
      skipSpaces();
    }
    if (pos < s.length) {
      if (!isLetter(s[pos])) return unparseable(text);
      return unknownCurrency(/^[\p{L}\p{M}]+/u.exec(s.slice(pos))![0]);
    }

    let currency: string;
    const written = [prefix, suffix].filter((t): t is Token => t !== undefined);
    if (written.length === 0) {
      if (defaultCurrency === undefined) {
        return { ok: false, issues: [{ code: 'missing_currency', message: 'Add a currency, like "$12" or "12 EUR".' }] };
      }
      currency = defaultCurrency;
    } else {
      const candidates = written.reduce<readonly string[]>((acc, t) => acc.filter((c) => t.candidates.includes(c)), written[0]!.candidates);
      if (candidates.length === 0) return unparseable(text);
      currency = resolveCandidates(candidates, defaultCurrency, ctx.locale.currency);
    }

    const digits = minorDigits(currency);
    const minorUnits = shiftDecimal(negative ? -n.value : n.value, digits);
    if (!Number.isInteger(minorUnits)) {
      const message = digits === 0 ? `${currency} amounts can't have decimal places.` : `${currency} amounts have at most ${digits} decimal places.`;
      return { ok: false, issues: [{ code: 'excess_precision', message }] };
    }
    if (!Number.isSafeInteger(minorUnits)) return unparseable(text);
    return { ok: true, value: { minorUnits: minorUnits === 0 ? 0 : minorUnits, currency } };
  };

  const check = (value: unknown): Array<{ message: string; path?: PropertyKey[] }> => {
    if (typeof value !== 'object' || value === null) return [{ message: 'Expected { minorUnits, currency }.' }];
    const v = value as Record<string, unknown>;
    const problems: Array<{ message: string; path?: PropertyKey[] }> = [];
    if (!Number.isSafeInteger(v.minorUnits)) problems.push({ message: 'Expected an integer number of minor units.', path: ['minorUnits'] });
    if (typeof v.currency !== 'string' || !isKnownCurrency(v.currency)) problems.push({ message: 'Expected a known ISO 4217 code.', path: ['currency'] });
    return problems;
  };

  const format = (value: Money, ctx: ResolvedCtx): string => {
    const digits = minorDigits(value.currency);
    const amount = formatNumber(Math.abs(shiftDecimal(value.minorUnits, -digits)), ctx, { minFractionDigits: digits, maxFractionDigits: digits });
    const sign = value.minorUnits < 0 ? '-' : '';
    const symbol = DISPLAY_SYMBOLS[value.currency];
    // Use the symbol only when it parses back to the same currency under the same context.
    const candidates = symbol === undefined ? undefined : CURRENCY_TOKENS[normalize(symbol).toLowerCase()];
    if (symbol === undefined || !candidates || resolveCandidates(candidates, defaultCurrency, ctx.locale.currency) !== value.currency) {
      return `${sign}${amount} ${value.currency}`;
    }
    if (ctx.locale.currencyPosition === 'suffix') return `${sign}${amount} ${symbol}`;
    return `${sign}${symbol}${isLetter(symbol[symbol.length - 1]) ? ' ' : ''}${amount}`;
  };

  return defineCodec<Money>({
    id: 'money',
    kind: 'money',
    parse,
    format,
    check,
    options: { schema: options?.schema, format: options?.format },
  });
}
