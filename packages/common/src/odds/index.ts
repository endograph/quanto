// @quantojs/common/odds: the odds codec, the Odds type and its operations. See DESIGN.md, "Odds".

export { odds } from './codec';
export type { OddsOptions } from './codec';
export type { Odds, OddsKind } from './types';
export { compare, convert, fromDecimal, impliedProbability, toDecimal } from './operations';
