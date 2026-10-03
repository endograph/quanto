// @quantojs/common/css-color: the CSS color codec, the CssColor type and the named-color table. See DESIGN.md, "CSS colors".

export { cssColor, formatCssColor } from './codec';
export type { CssColorOptions } from './codec';
export { cssColorNames } from './names';
export { checkCssColor, cssColorSpaces } from './value';
export type { CssColor, CssColorSpace } from './value';
