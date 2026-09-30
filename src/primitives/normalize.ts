const VULGAR_FRACTIONS: Readonly<Record<string, string>> = {
  '¼': '1/4', '½': '1/2', '¾': '3/4', '⅐': '1/7', '⅑': '1/9', '⅒': '1/10', '⅓': '1/3', '⅔': '2/3',
  '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8',
  '⅝': '5/8', '⅞': '7/8',
};

/**
 * Normalizes typed input before lexing, the way every built-in codec does:
 *
 * - smart quotes to `'` and `"`, and prime marks (`′ ″`) to `'` and `"`;
 * - Unicode fractions to `n/d` (`5½` → `5 1/2`);
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
    .replace(/(\d?)([¼-¾⅐-⅞])/g, (_, digit: string, fraction: string) => `${digit}${digit ? ' ' : ''}${VULGAR_FRACTIONS[fraction]}`)
    .normalize('NFKC')
    .replace(/⁄/g, '/')
    .replace(/[−﹣]/g, '-')
    .replace(/\s+/g, ' ');
}
