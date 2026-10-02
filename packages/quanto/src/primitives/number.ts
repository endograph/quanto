import type { Grammar } from '../core/types';
import { english } from '../grammar/english';
import { resolveLocale, type Locale } from '../locale';

/** Anything carrying resolved locale data, such as a `ResolvedCtx`. */
export interface LocaleCtx {
  readonly locale: Locale;
  /** Grammars for numbers in words, tried before English (see `Ctx.grammars`). */
  readonly grammars?: readonly Grammar[] | undefined;
}

export interface ReadNumberOptions {
  /** Where to start reading. Default 0. Leading spaces are skipped. */
  readonly from?: number | undefined;
  /** Accept magnitude suffixes: `k` (thousand), `m` (million), `b`/`bn` (billion), `t` (trillion). */
  readonly suffixes?: boolean | undefined;
}

export interface NumberMatch {
  readonly value: number;
  /** The index just past the number. */
  readonly end: number;
}

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';

const SUFFIX = /^(bn|k|m|b|t)(?![\p{L}\p{N}])/iu;
const SUFFIX_EXPONENT: Readonly<Record<string, number>> = { k: 3, m: 6, b: 9, bn: 9, t: 12 };

interface Separator {
  readonly char: string;
  readonly index: number;
}

/**
 * Reads the integer and fraction digits of a token, trying the grouping reading and the decimal
 * reading of an ambiguous separator in locale order. Returns undefined if no reading is valid.
 */
function interpret(token: string, seps: readonly Separator[], locale: Locale, wsGroups: readonly string[]): { int: string; frac: string } | undefined {
  const digitsBetween = (from: number, to: number): string => token.slice(from, to);
  const readings: Array<{ decimal: Separator | undefined }> = [];

  if (seps.length === 0) readings.push({ decimal: undefined });
  else {
    const last = seps[seps.length - 1]!;
    const dotComma = seps.filter((s) => s.char === '.' || s.char === ',');
    const kinds = new Set(dotComma.map((s) => s.char));
    const wsCount = seps.length - dotComma.length;
    if (kinds.size === 0) readings.push({ decimal: undefined });
    else if (kinds.size === 2) {
      // Both present: the last one is the decimal separator, regardless of locale.
      if (wsCount === 0 && dotComma.filter((s) => s.char === last.char).length === 1) readings.push({ decimal: last });
    } else if (dotComma.length > 1) {
      // One kind, several times: grouping.
      if (wsCount === 0) readings.push({ decimal: undefined });
    } else if (wsCount > 0) {
      // Grouped with spaces or apostrophes, so the single dot or comma is the decimal.
      if (!wsGroups.includes(last.char)) readings.push({ decimal: last });
    } else {
      const after = token.length - last.index - 1;
      if (after === 3) {
        // Ambiguous (`1,500`, `1.500`): the locale decides, and the other reading is the fallback.
        const asDecimal = { decimal: last };
        const asGroup = { decimal: undefined };
        readings.push(...(last.char === locale.decimal ? [asDecimal, asGroup] : [asGroup, asDecimal]));
      } else readings.push({ decimal: last });
    }
  }

  for (const { decimal } of readings) {
    const groupSeps = seps.filter((s) => s !== decimal);
    const intEnd = decimal ? decimal.index : token.length;
    const bounds = [-1, ...groupSeps.map((s) => s.index), intEnd];
    const groups: string[] = [];
    for (let i = 0; i < bounds.length - 1; i++) groups.push(digitsBetween(bounds[i]! + 1, bounds[i + 1]!));
    if (groupSeps.length > 0 && !validGrouping(groups)) continue;
    if (new Set(groupSeps.map((s) => s.char)).size > 1) continue;
    return { int: groups.join(''), frac: decimal ? token.slice(decimal.index + 1) : '' };
  }
  return undefined;
}

/**
 * Thousands grouping must be consistent: `1,234,567`, or `1,23,45,678` (Indian grouping by two, accepted in
 * every locale, since it has no other reading).
 */
function validGrouping(groups: readonly string[]): boolean {
  const [first, ...rest] = groups;
  if (!first || rest.length === 0) return false;
  if (rest[rest.length - 1]!.length !== 3) return false;
  const middle = rest.slice(0, -1).map((g) => g.length);
  return [3, 2].some((size) => middle.every((len) => len === size) && first.length >= 1 && first.length <= (middle.length > 0 ? size : 3));
}

/** A number as read by `readNumberToken`: its digits kept as text, with no floating-point conversion, for codecs that must stay exact (money). */
export type NumberToken =
  | { readonly kind: 'decimal'; readonly negative: boolean; readonly int: string; readonly frac: string; readonly exponent: number; readonly end: number }
  | { readonly kind: 'fraction'; readonly negative: boolean; readonly whole?: string; readonly numerator: string; readonly denominator: string; readonly end: number };

/**
 * Reads a number in digits at `options.from` (after spaces), like `readNumber`, but keeps its digits and
 * fraction as text, for exact parsing. `apostropheGroups` reads `1'000` in every locale, where it can't be feet.
 */
export function readNumberToken(text: string, ctx: LocaleCtx, options?: ReadNumberOptions, apostropheGroups = false): NumberToken | undefined {
  const locale = ctx.locale;
  // Space grouping (`1 000`) reads in every locale; apostrophe grouping (`1'000`) only where it can't be feet.
  const wsGroups = apostropheGroups || locale.group === "'" ? [' ', "'"] : [' '];
  let i = options?.from ?? 0;
  while (text[i] === ' ') i++;

  let negative = false;
  if (text[i] === '-' || text[i] === '+') {
    negative = text[i] === '-';
    i++;
  }

  const start = i;
  const seps: Separator[] = [];
  let j = i;
  while (j < text.length) {
    const c = text[j]!;
    if (isDigit(c)) j++;
    else if ((c === '.' || c === ',') && isDigit(text[j + 1])) {
      seps.push({ char: c, index: j - start });
      j++;
    } else if (wsGroups.includes(c) && j > start && isDigit(text[j - 1]) && /^\d{3}(?!\d)/.test(text.slice(j + 1))) {
      seps.push({ char: c, index: j - start });
      j++;
    } else break;
  }
  const token = text.slice(start, j);
  if (!/\d/.test(token)) return undefined;

  let int: string;
  let frac: string;
  if (seps[0]?.index === 0) {
    // A leading decimal separator: `.5`.
    if (seps.length > 1) return undefined;
    int = '0';
    frac = token.slice(1);
  } else {
    const read = interpret(token, seps, locale, wsGroups);
    if (!read) return undefined;
    ({ int, frac } = read);
  }

  const plainInteger = seps.length === 0;

  if (plainInteger) {
    const fraction = /^\/(\d+)/.exec(text.slice(j));
    if (fraction && /[1-9]/.test(fraction[1]!)) {
      return { kind: 'fraction', negative, numerator: int, denominator: fraction[1]!, end: j + fraction[0].length };
    }
    // `5 1/2`, and `5-1/2` as written in US building trades.
    const mixed = /^[ -](\d+)\/(\d+)/.exec(text.slice(j));
    if (mixed && /[1-9]/.test(mixed[2]!)) {
      return { kind: 'fraction', negative, whole: int, numerator: mixed[1]!, denominator: mixed[2]!, end: j + mixed[0].length };
    }
    // A trailing decimal point: `5. ft`.
    if (text[j] === '.' && !isDigit(text[j + 1])) j++;
  }

  let exponent = 0;
  const exp = /^[eE]([+-]?\d+)/.exec(text.slice(j));
  if (exp) {
    exponent = Number(exp[1]);
    j += exp[0].length;
  }
  if (options?.suffixes) {
    const suffix = SUFFIX.exec(text.slice(j));
    if (suffix) {
      exponent += SUFFIX_EXPONENT[suffix[1]!.toLowerCase()]!;
      j += suffix[0].length;
    }
  }

  return { kind: 'decimal', negative, int, frac, exponent, end: j };
}

/** `and a half` or `and a quarter`, after a whole number (`1 and a half miles`) or a quantity (`an hour and a half`). */
export const AND_FRACTION: RegExp = /^ *and +an? +(half|quarter)(?![\p{L}\p{N}])/iu;
/** The denominator of `AND_FRACTION`'s fraction word. */
export const andFraction = (match: RegExpExecArray): number => (match[1]!.toLowerCase() === 'half' ? 2 : 4);

let digitsCtx: LocaleCtx | undefined;

/**
 * A number written in words at `from` (after spaces), as a token: read by the first of `ctx.grammars`
 * that reads one, then by the built-in English grammar. The grammar's digit text is read exactly, so
 * money stays exact.
 */
export function readWordToken(text: string, ctx: LocaleCtx, from: number): NumberToken | undefined {
  let i = from;
  while (text[i] === ' ') i++;
  if (!/\p{L}/u.test(text[i] ?? '')) return undefined;
  for (const grammar of [...(ctx.grammars ?? []), english]) {
    const read = grammar.numbers?.read(text, i);
    if (!read) continue;
    digitsCtx ??= { locale: resolveLocale('en-US') };
    const token = readNumberToken(read.text, digitsCtx);
    if (!token || token.end !== read.text.length || read.end <= i) {
      throw new Error(`quanto: the "${grammar.language}" grammar read "${text.slice(i, read.end)}" as "${read.text}". A number grammar must return plain digit text, like "1500.5", "2/3" or "2 3/4", and an end past the words.`);
    }
    return { ...token, end: read.end };
  }
  return undefined;
}

/** Where numbers in words are, as [start, end) spans. Range splitting doesn't split inside one (`twenty-five`). */
export function numberWordSpans(text: string, ctx: LocaleCtx): Array<readonly [number, number]> {
  const spans: Array<readonly [number, number]> = [];
  for (let i = 0; i < text.length; i++) {
    if (!/\p{L}/u.test(text[i]!) || /\p{L}/u.test(text[i - 1] ?? '')) continue;
    const token = readWordToken(text, ctx, i);
    if (!token) continue;
    spans.push([i, token.end]);
    i = token.end - 1;
  }
  return spans;
}

/** An exact rational number; the denominator is positive. */
interface Ratio {
  readonly n: bigint;
  readonly d: bigint;
}

const tokenRatio = (token: NumberToken): Ratio => {
  const sign = token.negative ? -1n : 1n;
  if (token.kind === 'fraction') {
    const d = BigInt(token.denominator);
    return { n: sign * (BigInt(token.whole ?? 0) * d + BigInt(token.numerator)), d };
  }
  const exponent = token.exponent - token.frac.length;
  const digits = sign * BigInt(token.int + token.frac);
  return exponent >= 0 ? { n: digits * 10n ** BigInt(exponent), d: 1n } : { n: digits, d: 10n ** BigInt(-exponent) };
};

/** The nearest number to a ratio, through 20 significant digits; NaN if it isn't finite or underflows to zero. */
function ratioValue({ n, d }: Ratio): number {
  if (n === 0n) return 0;
  const limit = BigInt(Number.MAX_SAFE_INTEGER);
  if (n <= limit && n >= -limit && d <= limit) return Number(n) / Number(d);
  const abs = n < 0n ? -n : n;
  const shift = 20 - (abs.toString().length - d.toString().length);
  const q = shift >= 0 ? (abs * 10n ** BigInt(shift)) / d : abs / (d * 10n ** BigInt(-shift));
  const value = Number(`${n < 0n ? '-' : ''}${q}e${-shift}`);
  return Number.isFinite(value) && value !== 0 ? value : NaN;
}

/** Roughly log10 of a ratio's magnitude, from digit counts. */
const digits = (b: bigint): number => (b < 0n ? -b : b).toString().length;
/** Past 10^±400 a product can't be a finite, nonzero number; stopping there keeps the integers small. */
const MAX_MAGNITUDE = 400;
const POWER_LIMIT = 1100;
const POWER = /^ ?\^ ?([+-]?\d+)(?![\d.,/^])/;
const TIMES = /^ ?[*×·⋅] ?/;
/**
 * Math constants: `π` or `pi`, `φ` or `phi` (the golden ratio; NFKC turns `ϕ` into `φ`), and `e`, which
 * needs an operator after a number (`2*e`), since `2e` is the start of an exponent or of a unit (`2eV`).
 * A symbol can touch a unit (`πrad`); a word can't (`PiB` is pebibytes).
 */
const CONSTANT = /^(?:[πφ](?!\p{N})|(?:[Pp][Hh]?[Ii]|e)(?![\p{L}\p{N}]))/u;
const CONSTANTS: Readonly<Record<string, number>> = { 'π': Math.PI, pi: Math.PI, 'φ': (1 + Math.sqrt(5)) / 2, phi: (1 + Math.sqrt(5)) / 2, e: Math.E };
/** A constant written right after a number, multiplying it: `2π`, `2 pi`. */
const JUXTAPOSED = /^ ?(?=[πφ](?!\p{N})|[Pp][Hh]?[Ii](?![\p{L}\p{N}]))/u;

/**
 * Reads one number starting at `from`, using the locale rules (DESIGN.md, Locale-aware number
 * parsing): grouping and decimal separators, a sign, fractions (`1/2`, `5 1/2`), exponents (`1e3`)
 * and, with `suffixes`, magnitude suffixes (`1.2k`). Pass normalized text (see `normalize`).
 *
 * Numbers in words are read with `ctx.grammars`, then the built-in English grammar: `twenty-five`,
 * `one point five`, `three quarters`.
 *
 * Without `suffixes`, it also reads a product of powers: `10^3`, `2*5`, `6.02×10^23`. Powers take an
 * integer exponent and an unsigned base (`-2^2` could mean 4 or -4); the result is computed exactly and
 * rounded once. Factors can be the constants `π`/`pi`, `φ`/`phi` and `e`: `π/2`, `2π`, `e^2`.
 *
 * Returns `{ value, end }`, or `undefined` if there is no number at `from`.
 */
export function readNumber(text: string, ctx: LocaleCtx, options?: ReadNumberOptions): NumberMatch | undefined {
  const words = readWordToken(text, ctx, options?.from ?? 0);
  if (words) return tokenValue(words);
  const token = readNumberToken(text, ctx, options);
  if (!token) return options?.suffixes ? undefined : readProduct(text, ctx, options?.from ?? 0);
  const and = token.kind === 'decimal' && token.frac === '' && token.exponent === 0 && text[token.end] === ' ' ? AND_FRACTION.exec(text.slice(token.end)) : null;
  if (and && token.kind === 'decimal') {
    return tokenValue({ kind: 'fraction', negative: token.negative, whole: token.int, numerator: '1', denominator: String(andFraction(and)), end: token.end + and[0].length });
  }
  const rest = text.slice(token.end);
  if (!options?.suffixes && (POWER.test(rest) || TIMES.test(rest) || (token.kind === 'decimal' && JUXTAPOSED.test(rest)))) {
    return readProduct(text, ctx, options?.from ?? 0);
  }
  return tokenValue(token);
}

/** A token's value as a number, or undefined if it isn't finite. */
function tokenValue(token: NumberToken): NumberMatch | undefined {
  const sign = token.negative ? -1 : 1;
  const value = token.kind === 'fraction'
    ? sign * (Number(token.whole ?? 0) + Number(token.numerator) / Number(token.denominator))
    : Number(`${token.negative ? '-' : ''}${token.int}.${token.frac || '0'}e${token.exponent}`);
  if (!Number.isFinite(value)) return undefined;
  return { value: value === 0 ? 0 : value, end: token.end };
}

/** One factor of a product: an exact ratio times a constant (1 for a plain number). */
interface Factor {
  readonly ratio: Ratio;
  readonly constant: number;
  readonly negative: boolean;
  /** Whether a constant can follow without an operator: after a decimal (`2π`), not a fraction (`1/2π`). */
  readonly coefficient: boolean;
  readonly end: number;
}

/** A number or a math constant at `from` (after spaces). */
function readFactor(text: string, ctx: LocaleCtx, from: number): Factor | undefined {
  const token = readNumberToken(text, ctx, { from });
  if (token) return { ratio: tokenRatio(token), constant: 1, negative: token.negative, coefficient: token.kind === 'decimal', end: token.end };
  let i = from;
  while (text[i] === ' ') i++;
  let negative = false;
  if (text[i] === '-' || text[i] === '+') {
    negative = text[i] === '-';
    i++;
  }
  const match = CONSTANT.exec(text.slice(i));
  if (!match) return undefined;
  let end = i + match[0].length;
  let d = 1n;
  // `π/2`, and `2π/3`, which is the same number either way.
  const over = /^\/(\d+)(?![\d.,/^])/.exec(text.slice(end));
  if (over && /[1-9]/.test(over[1]!)) {
    d = BigInt(over[1]!);
    end += over[0].length;
  }
  return { ratio: { n: negative ? -1n : 1n, d }, constant: CONSTANTS[match[0].toLowerCase()]!, negative, coefficient: false, end };
}

/**
 * The product of powers at `from`. A malformed operator (`2^1.5`, `2*`, `-2^2`) makes the whole number
 * unreadable rather than stopping before it, so `2^3^2` isn't read as 8 with `^2` left over. The rational
 * part is exact; a constant multiplies it once at the end.
 */
function readProduct(text: string, ctx: LocaleCtx, from: number): NumberMatch | undefined {
  let n = 1n;
  let d = 1n;
  let constant = 1;
  let factor = readFactor(text, ctx, from);
  if (!factor) return undefined;
  let end: number;
  for (;;) {
    let ratio = factor.ratio;
    let k = factor.constant;
    let magnitude = ratio.n === 0n ? 0 : digits(ratio.n) - digits(ratio.d);
    end = factor.end;
    const power = POWER.exec(text.slice(end));
    if (power) {
      const exponent = Number(power[1]);
      magnitude *= exponent;
      if (factor.negative || Math.abs(exponent) > POWER_LIMIT || Math.abs(magnitude) > MAX_MAGNITUDE) return undefined;
      if (exponent < 0) {
        if (ratio.n === 0n) return undefined;
        ratio = ratio.n < 0n ? { n: -ratio.d, d: -ratio.n } : { n: ratio.d, d: ratio.n };
      }
      const e = BigInt(Math.abs(exponent));
      ratio = { n: ratio.n ** e, d: ratio.d ** e };
      k **= exponent;
      end += power[0].length;
    }
    n *= ratio.n;
    d *= ratio.d;
    constant *= k;
    if (n !== 0n && Math.abs(digits(n) - digits(d)) > MAX_MAGNITUDE) return undefined;
    const times = TIMES.exec(text.slice(end)) ?? (factor.coefficient && !power ? JUXTAPOSED.exec(text.slice(end)) : null);
    if (!times) break;
    const next = readFactor(text, ctx, end + times[0].length);
    if (!next) return undefined;
    factor = next;
  }
  if (/^ ?\^/.test(text.slice(end))) return undefined;
  const ratioPart = ratioValue({ n, d });
  if (Number.isNaN(ratioPart)) return undefined;
  const value = ratioPart * constant;
  if (!Number.isFinite(value) || (value === 0 && n !== 0n)) return undefined;
  return { value: value === 0 ? 0 : value, end };
}

export interface FormatNumberOptions {
  /** Default 2. Rounds half away from zero. */
  readonly maxFractionDigits?: number | undefined;
  /** Default 0. Pads with zeros. */
  readonly minFractionDigits?: number | undefined;
}

/** A plain decimal string (no exponent) for a non-negative finite number, from its shortest representation. */
function plainDecimal(n: number): string {
  const s = String(n);
  const match = /^(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(s);
  if (!match) return s;
  const digits = match[1]! + (match[2] ?? '');
  const point = match[1]!.length + Number(match[3]);
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + '0'.repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** Adds one unit in the last place to a string of digits. */
function incrementDigits(digits: string): string {
  const out = digits.split('');
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] === '9') out[i] = '0';
    else {
      out[i] = String(Number(out[i]) + 1);
      return out.join('');
    }
  }
  return `1${out.join('')}`;
}

const SUPERSCRIPT: Readonly<Record<string, string>> = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

/** From here up, a number prints as a power of ten: its digits past the first 17 are float noise. */
const SCIENTIFIC = 1e21;

/**
 * Formats a number with the region's bundled separators (DESIGN.md, Formatting), so the result reads
 * back with `readNumber` under the same locale. From 10²¹ up it prints as a power of ten, `1.62×10⁶⁵`,
 * or `10¹⁰⁰` when the factor is 1; the fraction digits apply to the factor.
 */
export function formatNumber(n: number, ctx: LocaleCtx, options?: FormatNumberOptions): string {
  if (!Number.isFinite(n)) throw new Error(`quanto: formatNumber can't format ${n}; pass a finite number.`);
  if (Math.abs(n) >= SCIENTIFIC) {
    const [digits, exp] = Math.abs(n).toExponential().split('e') as [string, string];
    let exponent = Number(exp);
    let factor = formatNumber(Number(digits), ctx, options);
    // Rounding the factor can carry it to 10: 9.9996×10³⁰ is 10³¹.
    if (factor === formatNumber(10, ctx, options)) {
      exponent++;
      factor = formatNumber(1, ctx, options);
    }
    const power = `10${[...String(exponent)].map((c) => SUPERSCRIPT[c]).join('')}`;
    return `${n < 0 ? '-' : ''}${factor === formatNumber(1, ctx, options) ? '' : `${factor}×`}${power}`;
  }
  const min = options?.minFractionDigits ?? 0;
  const max = Math.max(options?.maxFractionDigits ?? 2, min);
  let [int, frac = ''] = plainDecimal(Math.abs(n)).split('.') as [string, string?];
  if (frac.length > max) {
    const roundUp = frac[max]! >= '5';
    let kept = int + frac.slice(0, max);
    if (roundUp) kept = incrementDigits(kept);
    int = kept.slice(0, kept.length - max) || '0';
    frac = kept.slice(kept.length - max);
  }
  frac = frac.replace(/0+$/, '');
  if (frac.length < min) frac = frac.padEnd(min, '0');

  const isZero = /^[0.,' ]*$/.test(int) && /^0*$/.test(frac);
  return `${n < 0 && !isZero ? '-' : ''}${formatDecimalParts(int, frac, ctx)}`;
}

/** Formats already-rounded unsigned decimal digits, without converting them to a number. */
export function formatDecimalParts(int: string, frac: string, ctx: LocaleCtx): string {
  const locale = ctx.locale;
  if (int.length >= 3 + locale.minimumGroupingDigits) {
    const groups = [int.slice(-3)];
    let rest = int.slice(0, -3);
    while (rest.length > locale.secondaryGroupSize) {
      groups.unshift(rest.slice(-locale.secondaryGroupSize));
      rest = rest.slice(0, -locale.secondaryGroupSize);
    }
    if (rest) groups.unshift(rest);
    int = groups.join(locale.group);
  }

  return `${int}${frac ? locale.decimal + frac : ''}`;
}
