import type { Locale } from '../locale';

/** Anything carrying resolved locale data, such as a `ResolvedCtx`. */
export interface LocaleCtx {
  readonly locale: Locale;
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
function interpret(token: string, seps: readonly Separator[], locale: Locale, wsGroup: string | undefined): { int: string; frac: string } | undefined {
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
      if (last.char !== wsGroup) readings.push({ decimal: last });
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
    if (groupSeps.length > 0 && !validGrouping(groups, locale)) continue;
    if (new Set(groupSeps.map((s) => s.char)).size > 1) continue;
    return { int: groups.join(''), frac: decimal ? token.slice(decimal.index + 1) : '' };
  }
  return undefined;
}

/** Thousands grouping must be consistent: `1,234,567`, or `1,23,45,678` where the locale groups by two. */
function validGrouping(groups: readonly string[], locale: Locale): boolean {
  const [first, ...rest] = groups;
  if (!first || rest.length === 0) return false;
  if (rest[rest.length - 1]!.length !== 3) return false;
  const middle = rest.slice(0, -1).map((g) => g.length);
  const sizes = locale.secondaryGroupSize === 3 ? [3] : [3, locale.secondaryGroupSize];
  return sizes.some((size) => middle.every((len) => len === size) && first.length >= 1 && first.length <= (middle.length > 0 ? size : 3));
}

/**
 * Reads one number starting at `from`, using the locale rules (DESIGN.md, Locale-aware number
 * parsing): grouping and decimal separators, a sign, fractions (`1/2`, `5 1/2`), exponents (`1e3`)
 * and, with `suffixes`, magnitude suffixes (`1.2k`). Pass normalized text (see `normalize`).
 *
 * Returns `{ value, end }`, or `undefined` if there is no number at `from`.
 */
export function readNumber(text: string, ctx: LocaleCtx, options?: ReadNumberOptions): NumberMatch | undefined {
  const locale = ctx.locale;
  const wsGroup = locale.group === ' ' || locale.group === "'" ? locale.group : undefined;
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
    } else if (c === wsGroup && j > start && isDigit(text[j - 1]) && /^\d{3}(?!\d)/.test(text.slice(j + 1))) {
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
    const read = interpret(token, seps, locale, wsGroup);
    if (!read) return undefined;
    ({ int, frac } = read);
  }

  const sign = negative ? '-' : '';
  const signum = negative ? -1 : 1;
  const plainInteger = seps.length === 0;

  if (plainInteger) {
    const fraction = /^\/(\d+)/.exec(text.slice(j));
    if (fraction && Number(fraction[1]) > 0) {
      return { value: signum * (Number(int) / Number(fraction[1])), end: j + fraction[0].length };
    }
    const mixed = /^ (\d+)\/(\d+)/.exec(text.slice(j));
    if (mixed && Number(mixed[2]) > 0) {
      return { value: signum * (Number(int) + Number(mixed[1]) / Number(mixed[2])), end: j + mixed[0].length };
    }
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

  // Building the decimal string and parsing once keeps results exact (`1.1k` is 1100, not 1100.0000000000002).
  const value = Number(`${sign}${int}.${frac || '0'}e${exponent}`);
  if (!Number.isFinite(value)) return undefined;
  return { value: value === 0 ? 0 : value, end: j };
}

export interface FormatNumberOptions {
  /** Default 3. Rounds half away from zero. */
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

/**
 * Formats a number with the region's bundled separators (DESIGN.md, Formatting), so the result reads
 * back with `readNumber` under the same locale.
 */
export function formatNumber(n: number, ctx: LocaleCtx, options?: FormatNumberOptions): string {
  if (!Number.isFinite(n)) throw new Error(`quanto: formatNumber can't format ${n}; pass a finite number.`);
  const min = options?.minFractionDigits ?? 0;
  const max = Math.max(options?.maxFractionDigits ?? 3, min);
  const locale = ctx.locale;

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

  const isZero = /^[0.,' ]*$/.test(int) && /^0*$/.test(frac);
  return `${n < 0 && !isZero ? '-' : ''}${int}${frac ? locale.decimal + frac : ''}`;
}
