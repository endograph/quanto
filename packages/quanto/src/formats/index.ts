// Formatter helpers, for a codec's `format` option. See DESIGN.md, Formatting.
// Ready-made formatters (`feetInches`, `intlUnit`, …) are in @quantojs/common/formats.

import type { UnitTable } from '../quantity/codec';
import { convertValue, factorOf, isLinear, sumLinear } from '../quantity/convert';
import type { Quantity, ResolvedCtx } from '../core/types';
import { formatNumber } from '../primitives/number';

/** A formatter for a codec's `format` option. */
export type Formatter<T> = (value: T, ctx: ResolvedCtx) => string;

// Compound formatters ---------------------------------------------------------------------------

/** One part of a compound formatter: a linear unit of the table, and how to write a count of it. */
export interface CompoundPart {
  readonly unit: string;
  readonly text: (n: string) => string;
}

/** How a compound formatter joins its parts, and whether it keeps zero parts after the first. */
export interface CompoundOptions {
  /** Between parts. Default `' '`. */
  readonly separator?: string;
  /** Keep zero parts after the first (`6'0"`). Default true; false writes a whole amount alone (`2h`). */
  readonly trailingZeros?: boolean;
}

/**
 * A formatter that splits a quantity into whole parts, largest first (`[ft, in]`), rounding the smallest
 * part to a whole number and carrying into the larger ones. Leading zero parts are left out. Later zero
 * parts are kept (`6'0"`) unless `trailingZeros` is false, for notations that write a whole amount alone
 * (`2h`). `name` is for error messages. Every part's unit must be a linear unit of `units`.
 */
export function compoundFormatter(
  name: string,
  units: UnitTable,
  parts: readonly CompoundPart[],
  { separator = ' ', trailingZeros = true }: CompoundOptions = {},
): Formatter<Quantity<string>> {
  if (parts.length === 0) throw new Error(`quanto: ${name} needs at least one part.`);
  for (const p of parts) {
    const def = Object.hasOwn(units, p.unit) ? units[p.unit] : undefined;
    if (!def || !isLinear(def.toBase)) throw new Error(`quanto: ${name}'s part "${p.unit}" must be a linear unit of its table.`);
  }
  const smallest = parts[parts.length - 1]!;
  const factor = (unit: string): number => factorOf(units[unit]!.toBase);
  // How many of the smallest part make one of each part: [12, 1] for feet and inches.
  const sizes = parts.map((p) => sumLinear([{ value: 1, factor: factor(p.unit) }], factor(smallest.unit)));

  return (value, ctx) => {
    const def = Object.hasOwn(units, value.unit) ? units[value.unit] : undefined;
    if (!def) throw new Error(`quanto: ${name} can't format "${value.unit}": use it with a codec whose units include ${parts.map((p) => p.unit).join(' and ')}.`);
    const total = Math.round(Math.abs(convertValue(value.value, def, units[smallest.unit]!)));
    let rest = total;
    const counts = sizes.map((size) => {
      const n = Math.floor(rest / size);
      rest -= n * size;
      return n;
    });
    const first = counts.findIndex((n) => n !== 0);
    const from = first === -1 ? counts.length - 1 : first;
    const shown = counts.map((_, i) => i).filter((i) => i >= from && (trailingZeros || i === from || counts[i] !== 0));
    const text = shown.map((i) => parts[i]!.text(formatNumber(counts[i]!, ctx, { maxFractionDigits: 0 }))).join(separator);
    return value.value < 0 && total !== 0 ? `-${text}` : text;
  };
}
