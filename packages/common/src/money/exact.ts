import type { RoundingMode } from './operations';

/** Exact decimal interpretation of a finite number's shortest representation. Internal only. */
export function decimalFraction(value: number): { numerator: bigint; denominator: bigint } {
  const [mantissa, writtenExponent] = String(value).split('e');
  const [whole, fraction = ''] = mantissa!.split('.');
  const exponent = Number(writtenExponent ?? 0) - fraction.length;
  const digits = BigInt(whole! + fraction);
  return exponent >= 0
    ? { numerator: digits * 10n ** BigInt(exponent), denominator: 1n }
    : { numerator: digits, denominator: 10n ** BigInt(-exponent) };
}

/** Rounds an exact fraction once. The denominator is positive; BigInt division truncates toward zero. */
export function roundFraction(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  const direction = numerator < 0n ? -1n : 1n;
  const away = quotient + direction;
  switch (mode) {
    case 'ceil': return direction > 0n ? away : quotient;
    case 'floor': return direction < 0n ? away : quotient;
    case 'expand': return away;
    case 'trunc': return quotient;
    default: {
      const twice = (remainder < 0n ? -remainder : remainder) * 2n;
      if (twice < denominator) return quotient;
      if (twice > denominator) return away;
      switch (mode) {
        case 'halfCeil': return direction > 0n ? away : quotient;
        case 'halfFloor': return direction < 0n ? away : quotient;
        case 'halfExpand': return away;
        case 'halfTrunc': return quotient;
        case 'halfEven': return quotient % 2n === 0n ? quotient : away;
      }
    }
  }
}

/** Convert back to the public JSON-safe representation only after checking the exact integer. */
export function safeMinorUnits(value: bigint, operation: string): number {
  const limit = BigInt(Number.MAX_SAFE_INTEGER);
  if (value < -limit || value > limit) {
    throw new Error(`quanto: the result of ${operation} (${value} minor units) is too large to represent exactly.`);
  }
  return Number(value);
}
