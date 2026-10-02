/**
 * An amount in the currency's minor unit (cents for USD), never a float. Store it as it is: it's plain
 * JSON, and `minorUnits` is always an integer.
 */
export interface Money<C extends string = string> {
  readonly minorUnits: number;
  /** ISO 4217 code. */
  readonly currency: C;
}
