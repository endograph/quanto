/** The three notations odds are written in. */
export type OddsKind = 'fractional' | 'decimal' | 'american';

/**
 * Betting odds, kept in the notation they were written in. Plain JSON.
 *
 * - `fractional`: profit to stake, against: `11/4` is `{ numerator: 11, denominator: 4 }`, kept as
 *   written rather than reduced, since bookmakers use conventional fractions (`100/30`, `6/4`). Odds-on
 *   `2/1 on` is `1/2`.
 * - `decimal`: total return per unit staked, above 1: `3.75`.
 * - `american`: `+275` is the profit on 100 staked, `-200` the stake that wins 100. At least 100 either way.
 */
export type Odds =
  | { readonly kind: 'fractional'; readonly numerator: number; readonly denominator: number }
  | { readonly kind: 'decimal'; readonly value: number }
  | { readonly kind: 'american'; readonly value: number };
