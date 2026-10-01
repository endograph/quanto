import type { Grammar } from '../core/types';

const UNITS: Readonly<Record<string, number>> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Readonly<Record<string, number>> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Readonly<Record<string, number>> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Readonly<Record<string, number>> = { thousand: 3, million: 6, billion: 9, trillion: 12 };
/** Fraction words and their denominators. Not `second`, which is a unit of time. */
const FRACTIONS: Readonly<Record<string, number>> = {
  half: 2, halves: 2, third: 3, thirds: 3, quarter: 4, quarters: 4, fourth: 4, fourths: 4, fifth: 5, fifths: 5,
  eighth: 8, eighths: 8, sixteenth: 16, sixteenths: 16,
};
const SIGNS = new Set(['minus', 'negative']);

/** Words that are only ever part of a number, so a number can't be followed by one (`two fifty`). */
const isNumberWord = (w: string): boolean =>
  w in UNITS || w in TEENS || w in TENS || w in SCALES || w in FRACTIONS || w === 'hundred' || w === 'point';

interface Word {
  readonly word: string;
  readonly start: number;
  readonly end: number;
}

/** A number read so far: an integer, a decimal (digit text), or a ratio. */
type Value = { readonly kind: 'integer'; readonly n: bigint } | { readonly kind: 'decimal'; readonly text: string } | { readonly kind: 'ratio'; readonly n: bigint; readonly d: bigint };
interface Read<V> {
  readonly value: V;
  readonly end: number;
}

/** The lowercase word at `at`, after spaces. A word followed by a letter or digit isn't one; a hyphen may follow. */
function wordAt(lower: string, at: number): Word | undefined {
  let i = at;
  while (lower[i] === ' ') i++;
  const m = /^[a-z]+/.exec(lower.slice(i));
  if (!m) return undefined;
  const end = i + m[0].length;
  if (/[\p{L}\p{N}]/u.test(lower[end] ?? '')) return undefined;
  return { word: m[0], start: i, end };
}

const isArticle = (w: Word | undefined): boolean => w?.word === 'a' || w?.word === 'an';
/** Whether a word ends its part of the number: not hyphenated to what follows, except a fraction (`three-quarters`). */
const ends = (lower: string, w: Word): boolean => lower[w.end] !== '-' || (wordAt(lower, w.end + 1)?.word ?? '') in FRACTIONS;

/** 0–99: `seven`, `fifteen`, `forty`, `forty-two`, `forty two`. */
function sub100(lower: string, at: number): Read<number> | undefined {
  const w = wordAt(lower, at);
  if (!w) return undefined;
  const simple = UNITS[w.word] ?? TEENS[w.word];
  if (simple !== undefined) return ends(lower, w) ? { value: simple, end: w.end } : undefined;
  const tens = TENS[w.word];
  if (tens === undefined) return undefined;
  // One space or hyphen, then a unit: `forty-two`, `forty two`.
  const unit = lower[w.end] === '-' || lower[w.end] === ' ' ? wordAt(lower, w.end + 1) : undefined;
  if (unit && unit.start === w.end + 1 && UNITS[unit.word] && ends(lower, unit)) return { value: tens + UNITS[unit.word]!, end: unit.end };
  return ends(lower, w) ? { value: tens, end: w.end } : undefined;
}

/** 0–9999: a `sub100` (or `a`/`an` before a scale word), optionally `hundred` and a `sub100` after: `a hundred`, `fifteen hundred and five`. */
function chunk(lower: string, at: number): Read<number> | undefined {
  let head = sub100(lower, at);
  if (!head) {
    const article = wordAt(lower, at);
    const next = isArticle(article) ? wordAt(lower, article!.end) : undefined;
    if (!next || !(next.word === 'hundred' || next.word in SCALES)) return undefined;
    head = { value: 1, end: article!.end };
  }
  const hundred = wordAt(lower, head.end);
  if (hundred?.word !== 'hundred' || head.value === 0) return head;
  const and = wordAt(lower, hundred.end);
  const tail = sub100(lower, and?.word === 'and' ? and.end : hundred.end);
  return tail && tail.value > 0 ? { value: head.value * 100 + tail.value, end: tail.end } : { value: head.value * 100, end: hundred.end };
}

/** A whole number: chunks joined by decreasing scales (`two million three hundred thousand and five`). */
function cardinal(lower: string, at: number): Read<bigint> | undefined {
  let current = chunk(lower, at);
  if (!current) return undefined;
  let total = 0n;
  let lastScale = Infinity;
  for (;;) {
    const scale = wordAt(lower, current.end);
    const exponent = scale ? SCALES[scale.word] : undefined;
    if (exponent === undefined) return { value: total + BigInt(current.value), end: current.end };
    if (exponent >= lastScale || current.value === 0) return undefined;
    total += BigInt(current.value) * 10n ** BigInt(exponent);
    lastScale = exponent;
    // After a scale, another chunk; after `and`, only one under a hundred (`one thousand and five`).
    const and = wordAt(lower, scale!.end);
    const next = chunk(lower, and?.word === 'and' ? and.end : scale!.end);
    if (!next || (and?.word === 'and' && next.value >= 100)) return { value: total, end: scale!.end };
    current = next;
  }
}

/** A fraction word, after a space or hyphen, and `of`/`a`/`an` after it: `three quarters of an`, `three-quarters`, `half a`. */
function fraction(lower: string, at: number): Read<bigint> | undefined {
  const w = wordAt(lower, lower[at] === '-' ? at + 1 : at);
  const denominator = w ? FRACTIONS[w.word] : undefined;
  if (denominator === undefined) return undefined;
  let end = w!.end;
  const of = wordAt(lower, end);
  if (of?.word === 'of') end = of.end;
  const article = wordAt(lower, end);
  if (isArticle(article) && lower[article!.end] === ' ') end = article!.end;
  return { value: BigInt(denominator), end };
}

/** `point` and one digit word per decimal place: `point two five`. */
function decimals(lower: string, at: number): Read<string> | undefined {
  const point = wordAt(lower, at);
  if (point?.word !== 'point') return undefined;
  let digits = '';
  let end = point.end;
  for (let d = wordAt(lower, end); d && d.word in UNITS; d = wordAt(lower, end)) {
    digits += UNITS[d.word];
    end = d.end;
  }
  return digits ? { value: digits, end } : undefined;
}

/** The number at `at`, without a sign or a scale after it. */
function unsigned(lower: string, at: number): Read<Value> | undefined {
  const whole = cardinal(lower, at);
  if (!whole) {
    const point = decimals(lower, at);
    if (point) return { value: { kind: 'decimal', text: `0.${point.value}` }, end: point.end };
    // `half`, `a third`, and `a`/`an` as one before a word that isn't a number (`a mile`).
    const article = wordAt(lower, at);
    const f = fraction(lower, isArticle(article) ? article!.end : at);
    if (f) return { value: { kind: 'ratio', n: 1n, d: f.value }, end: f.end };
    const next = isArticle(article) && lower[article!.end] === ' ' ? wordAt(lower, article!.end) : undefined;
    if (!next || isNumberWord(next.word) || SIGNS.has(next.word)) return undefined;
    return { value: { kind: 'integer', n: 1n }, end: article!.end };
  }
  const point = decimals(lower, whole.end);
  if (point) return { value: { kind: 'decimal', text: `${whole.value}.${point.value}` }, end: point.end };
  // `three quarters`, `one half`.
  const over = whole.value > 0n && whole.value < 100n ? fraction(lower, whole.end) : undefined;
  if (over) return { value: { kind: 'ratio', n: whole.value, d: over.value }, end: over.end };
  // `two and a half`, `five and seven eighths`.
  const and = wordAt(lower, whole.end);
  if (and?.word === 'and') {
    const article = wordAt(lower, and.end);
    const count = isArticle(article) ? { value: 1n, end: article!.end } : cardinal(lower, and.end);
    const f = count && count.value > 0n ? fraction(lower, count.end) : undefined;
    if (f) return { value: { kind: 'ratio', n: whole.value * f.value + count!.value, d: f.value }, end: f.end };
  }
  return { value: { kind: 'integer', n: whole.value }, end: whole.end };
}

/**
 * The English number grammar, built in: cardinals (`twenty-five`, `one hundred and five`, `fifteen
 * hundred`, `three million`), decimals (`one point five`), fractions (`three quarters`, `a third`,
 * `two and a half`, `half a`), signs (`minus five`), a scale after a decimal or fraction (`half a
 * million`), and `a`/`an` as one before a word (`a mile`). Anything that isn't one well-formed number
 * reads as no number.
 */
export const english: Grammar = {
  language: 'en',
  numbers: {
    read(text, from) {
      const lower = text.toLowerCase();
      const sign = wordAt(lower, from);
      const negative = sign !== undefined && SIGNS.has(sign.word);
      const read = unsigned(lower, negative ? sign.end : from);
      if (!read) return undefined;
      let { value, end } = read;
      // A decimal or a fraction can take a scale (`one point five million`); an integer already has its scales.
      const scale = value.kind === 'integer' ? undefined : wordAt(lower, end);
      const exponent = scale ? SCALES[scale.word] : undefined;
      if (exponent !== undefined) {
        value = value.kind === 'decimal'
          ? { kind: 'decimal', text: `${value.text}e${exponent}` }
          : { kind: 'ratio', n: value.n * 10n ** BigInt(exponent), d: value.kind === 'ratio' ? value.d : 1n };
        end = scale!.end;
      }
      // A number can't be followed by another number word: `two fifty` and `nineteen eighty four` are rejected, not guessed.
      const next = wordAt(lower, end);
      if (next && isNumberWord(next.word)) return undefined;
      const digits = value.kind === 'decimal' ? value.text : value.kind === 'ratio' ? `${value.n}/${value.d}` : `${value.n}`;
      return { text: `${negative ? '-' : ''}${digits}`, end };
    },
  },
};
