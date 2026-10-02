import { defineCodec, formatDecimalParts, normalize, readNumber, readNumberToken, readWordToken, type Codec, type CodecOptions, type NumberToken, type ParseOutcome, type ResolvedCtx } from 'quanto';
import { CURRENCY_TOKENS, DISPLAY_SYMBOLS, isKnownCurrency, MINOR_TOKENS, minorDigits, resolveCandidates } from '../currencies';
import { regionCurrency, symbolPosition } from '../locale';
import type { Money } from '../types';

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

type TokenTable = ReadonlyArray<{ readonly key: string; readonly candidates: readonly string[] }>;

const tokenTable = (tokens: Readonly<Record<string, readonly string[]>>): TokenTable => {
  const all = new Map<string, readonly string[]>();
  for (const [key, candidates] of Object.entries(tokens)) all.set(normalize(key).toLowerCase(), candidates);
  return [...all].map(([key, candidates]) => ({ key, candidates })).sort((a, b) => b.key.length - a.key.length);
};
const TOKENS = tokenTable(CURRENCY_TOKENS);
const MINOR = tokenTable(MINOR_TOKENS);

/** Magnitude words after the number: `$12 million`, `12 grand`, `$12mm` (finance's million). */
const MAGNITUDE = /^ ?(thousand|grand|million|mil|mn|mm|billion|trillion)(?![\p{L}\p{N}])/iu;
const MAGNITUDE_EXPONENT: Readonly<Record<string, number>> = { thousand: 3, grand: 3, million: 6, mil: 6, mn: 6, mm: 6, billion: 9, trillion: 12 };

const isLetter = (c: string | undefined): boolean => c !== undefined && /\p{L}/u.test(c);

/**
 * Matches a currency symbol, name or ISO code at `at`, not inside a word. A period after a word is
 * skipped when it isn't a decimal point: `Twenty dollars.`, as dictation writes it.
 */
function matchToken(lower: string, at: number, table: TokenTable = TOKENS): Token | undefined {
  const token = matchTokenAt(lower, at, table);
  if (!token || !isLetter(lower[token.end - 1]) || lower[token.end] !== '.' || /\d/.test(lower[token.end + 1] ?? '')) return token;
  return { ...token, end: token.end + 1 };
}

function matchTokenAt(lower: string, at: number, table: TokenTable): Token | undefined {
  if (isLetter(lower[at - 1]) && isLetter(lower[at])) return undefined;
  if (table === TOKENS) {
    const code = /^[a-z]{3}(?!\p{L})/u.exec(lower.slice(at))?.[0];
    if (code && isKnownCurrency(code.toUpperCase())) return { candidates: [code.toUpperCase()], end: at + 3 };
  }
  for (const { key, candidates } of table) {
    if (!lower.startsWith(key, at)) continue;
    if (isLetter(key[key.length - 1]) && isLetter(lower[at + key.length])) continue;
    return { candidates, end: at + key.length };
  }
  return undefined;
}

/** Exact minor units, or the reason the written amount cannot be stored. */
function toMinorUnits(token: NumberToken, digits: number): bigint | 'excess_precision' | 'overflow' {
  const sign = token.negative ? -1n : 1n;
  if (token.kind === 'fraction') {
    const denominator = BigInt(token.denominator);
    const numerator = (BigInt(token.whole ?? 0) * denominator + BigInt(token.numerator)) * 10n ** BigInt(digits);
    if (numerator % denominator !== 0n) return 'excess_precision';
    return sign * (numerator / denominator);
  }
  let coefficient = (token.int + token.frac).replace(/^0+/, '');
  if (coefficient === '') return 0n;
  const shift = token.exponent - token.frac.length + digits;
  if (shift >= 0) {
    // No powers or strings proportional to a user-supplied exponent: safe integers have at most 16 digits.
    if (coefficient.length + shift > 16) return 'overflow';
    coefficient += '0'.repeat(shift);
  } else {
    const places = -shift;
    if (places >= coefficient.length || /[1-9]/.test(coefficient.slice(-places))) return 'excess_precision';
    coefficient = coefficient.slice(0, -places);
    if (coefficient.length > 16) return 'overflow';
  }
  return sign * BigInt(coefficient);
}

/**
 * Money: `$12`, `12 USD`, `€12,50`, `12.50 eur`, `$1.2k`, `12 bucks`, `five dollars and fifty cents`. Amounts are integers in the
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
    // Accounting negatives: "($12)". The inside can't carry a sign of its own.
    const paren = /^\( *(.*?) *\)$/.exec(s);
    if (paren) {
      if (/^[-+(]/.test(paren[1]!)) return unparseable(text);
      const inner = parse(paren[1]!, ctx);
      if (!inner.ok) return inner;
      if (inner.value.minorUnits < 0) return unparseable(text);
      return { ok: true, value: { ...inner.value, minorUnits: inner.value.minorUnits === 0 ? 0 : -inner.value.minorUnits } };
    }
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
    } else if (isLetter(s[pos]) && !readWordToken(s, ctx, pos)) {
      // A word before a number names a currency ("XYZ 12"), unless the number is in words too ("two fifty").
      const word = /^[\p{L}\p{M}]+/u.exec(s.slice(pos))![0];
      const after = pos + word.length;
      return readNumber(s, ctx, { from: after }) && !/^ *\p{L}/u.test(s.slice(after)) ? unknownCurrency(word) : unparseable(text);
    }

    if (negative && (s[pos] === '-' || s[pos] === '+')) return unparseable(text);
    // Apostrophe grouping ("CHF 1'234.50") reads in every locale: money has no feet to confuse it with.
    let n = readNumberToken(s, ctx, { from: pos, suffixes: true }, true);
    const inWords = !n;
    n ??= readWordToken(s, ctx, pos);
    if (!n) return unparseable(text);
    pos = n.end;
    const magnitude = MAGNITUDE.exec(s.slice(pos));
    if (magnitude) {
      // Not after a suffix ("$12k grand") or on a fraction, and only once.
      if ((!inWords && isLetter(s[pos - 1])) || n.kind === 'fraction') return unparseable(text);
      n = { ...n, exponent: n.exponent + MAGNITUDE_EXPONENT[magnitude[1]!.toLowerCase()]!, end: pos + magnitude[0].length };
      pos = n.end;
      if (MAGNITUDE.test(s.slice(pos))) return unparseable(text);
    }
    skipSpaces();

    const suffix = pos < s.length ? matchToken(lower, pos) : undefined;
    // A minor unit ("50¢", "50 cents", "5p") stands alone: no currency symbol or code with it.
    const minor = !suffix && !prefix && pos < s.length ? matchToken(lower, pos, MINOR) : undefined;
    const currencyToken = suffix ?? minor;
    if (currencyToken) {
      pos = currencyToken.end;
      skipSpaces();
      if (minor && pos < s.length) return unparseable(text);
    }
    // Cents after the amount: "five dollars and fifty cents", "$5 and 50 cents", "ten pounds five pence".
    let cents: { readonly token: NumberToken; readonly minor: Token } | undefined;
    if ((prefix || suffix) && pos < s.length) {
      const from = pos + /^(?:(?:and|&|,) *)?/i.exec(s.slice(pos))![0].length;
      const amount = readNumberToken(s, ctx, { from }) ?? readWordToken(s, ctx, from);
      if (amount) {
        pos = amount.end;
        skipSpaces();
        const unit = matchToken(lower, pos, MINOR);
        if (!unit) return unparseable(text);
        pos = unit.end;
        skipSpaces();
        if (pos < s.length) return unparseable(text);
        cents = { token: amount, minor: unit };
      }
    }
    if (pos < s.length) {
      if (!isLetter(s[pos])) return unparseable(text);
      return unknownCurrency(/^[\p{L}\p{M}]+/u.exec(s.slice(pos))![0]);
    }

    let currency: string;
    const written = [prefix, currencyToken].filter((t): t is Token => t !== undefined);
    if (written.length === 0) {
      if (defaultCurrency === undefined) {
        return { ok: false, issues: [{ code: 'missing_currency', message: 'Add a currency, like "$12" or "12 EUR".' }] };
      }
      currency = defaultCurrency;
    } else {
      const candidates = written.reduce<readonly string[]>((acc, t) => acc.filter((c) => t.candidates.includes(c)), written[0]!.candidates);
      if (candidates.length === 0) return unparseable(text);
      currency = resolveCandidates(candidates, defaultCurrency, regionCurrency(ctx.locale));
    }

    const digits = minorDigits(currency);
    const exact = toMinorUnits(n, minor ? 0 : digits);
    if (exact === 'excess_precision') {
      const message = minor
        ? 'A number of cents or pence has no decimal places.'
        : digits === 0 ? `${currency} amounts can't have decimal places.` : `${currency} amounts have at most ${digits} decimal places.`;
      return { ok: false, issues: [{ code: 'excess_precision', message }] };
    }
    if (exact === 'overflow') return unparseable(text);
    let total = exact;
    if (cents) {
      // Fewer than a hundred, in this currency's minor unit, and in the amount's direction.
      const minorUnits = toMinorUnits(cents.token, 0);
      if (digits !== 2 || !cents.minor.candidates.includes(currency) || typeof minorUnits !== 'bigint' || minorUnits < 0n || minorUnits >= 100n) return unparseable(text);
      total = n.negative ? exact - minorUnits : exact + minorUnits;
    }
    const signed = negative ? -total : total;
    const limit = BigInt(Number.MAX_SAFE_INTEGER);
    if (signed < -limit || signed > limit) return unparseable(text);
    return { ok: true, value: { minorUnits: Number(signed), currency } };
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
    const written = String(Math.abs(value.minorUnits)).padStart(digits + 1, '0');
    const integer = digits === 0 ? written : written.slice(0, -digits);
    const fraction = digits === 0 ? '' : written.slice(-digits);
    const amount = formatDecimalParts(integer, fraction, ctx);
    const sign = value.minorUnits < 0 ? '-' : '';
    const symbol = DISPLAY_SYMBOLS[value.currency];
    // Use the symbol only when it parses back to the same currency under the same context.
    const candidates = symbol === undefined ? undefined : CURRENCY_TOKENS[normalize(symbol).toLowerCase()];
    if (symbol === undefined || !candidates || resolveCandidates(candidates, defaultCurrency, regionCurrency(ctx.locale)) !== value.currency) {
      return `${sign}${amount} ${value.currency}`;
    }
    if (symbolPosition(ctx.locale) === 'suffix') return `${sign}${amount} ${symbol}`;
    return `${sign}${symbol}${isLetter(symbol[symbol.length - 1]) ? ' ' : ''}${amount}`;
  };

  return defineCodec<Money>({
    id: 'money',
    parse,
    format,
    check,
    options: { schema: options?.schema, format: options?.format },
  });
}
