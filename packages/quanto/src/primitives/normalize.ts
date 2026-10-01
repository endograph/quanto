const VULGAR_FRACTIONS: Readonly<Record<string, string>> = {
  '¼': '1/4', '½': '1/2', '¾': '3/4', '⅐': '1/7', '⅑': '1/9', '⅒': '1/10', '⅓': '1/3', '⅔': '2/3',
  '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8',
  '⅝': '5/8', '⅞': '7/8',
};

const SUPERSCRIPTS: Readonly<Record<string, string>> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-',
};

/**
 * Normalizes typed input before lexing, the way every built-in codec does:
 *
 * - smart quotes to `'` and `"`, prime marks (`′ ″`) to `'` and `"`, and two apostrophes (`''`) to `"`;
 * - the degree sign's look-alikes (`º`, `˚`) to `°`;
 * - Unicode fractions to `n/d` (`5½` → `5 1/2`), including typeset ones (`1¹⁄₂` → `1 1/2`);
 * - a superscript exponent on a number to `^` (`10³` → `10^3`); after a letter it's part of the unit, and so
 *   is `^` (`m²` and `m^2` → `m2`);
 * - Unicode compatibility forms (NFKC), so full-width digits read as digits;
 * - the Unicode minus sign to `-`;
 * - non-breaking, thin and other spaces to a single space.
 *
 * It doesn't fold case and doesn't trim.
 */
export function normalize(text: string): string {
  return text
    .replace(/[′‘’‚‛ʼ]/g, "'")
    .replace(/[″“”„‟]/g, '"')
    .replace(/''/g, '"')
    // Before NFKC, which turns `º` into `o`.
    .replace(/[º˚]/g, '°')
    .replace(/(\d?)([¼-¾⅐-⅞])/g, (_, digit: string, fraction: string) => `${digit}${digit ? ' ' : ''}${VULGAR_FRACTIONS[fraction]}`)
    // A typeset fraction after a whole number: `1¹⁄₂` is 1 1/2 (NFKC turns the digits plain below).
    .replace(/(\d)(?=[⁰¹²³⁴-⁹]+[⁄/][₀-₉])/g, '$1 ')
    // A whole run of superscripts after a digit is an exponent, unless a fraction slash follows (`1¹⁵⁄₁₆`).
    .replace(/(\d)([⁺⁻]?[⁰¹²³⁴-⁹]+)(?![⁰¹²³⁴-⁹⁄/])/g, (_, digit: string, sup: string) => `${digit}^${[...sup].map((c) => SUPERSCRIPTS[c]).join('')}`)
    .normalize('NFKC')
    .replace(/⁄/g, '/')
    .replace(/(\p{L})\^(\d)/gu, '$1$2')
    .replace(/[−﹣]/g, '-')
    .replace(/\s+/g, ' ');
}
