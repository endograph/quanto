// Ready-made formatters, for a codec's `format` option. See DESIGN.md, Formatting.
//
// - Compound formatters (`feetInches`, …) use bundled data only: deterministic, and they round-trip.
//   They're built with quanto's `compoundFormatter`; build your own the same way.
// - `intlUnit` uses Intl for richer, localized output. It's display-only: its output varies
//   between ICU versions and isn't guaranteed to parse back, so use it with `display="raw"` and never
//   set `raw` from it. Money and date formatters, including their Intl ones, are in @quantojs/common/money
//   and @quantojs/datetime.

import type { Quantity } from 'quanto';
import { compoundFormatter, type Formatter } from 'quanto/formats';
import { durationUnits } from '../duration';
import { lengthUnits } from '../length';
import { massUnits } from '../mass';

/** Lengths as feet and whole inches: `5'11"`, `6'0"`, `11"`. For `length()`. */
export const feetInches: Formatter<Quantity<string>> = compoundFormatter(
  'feetInches',
  lengthUnits,
  [
    { unit: 'ft', text: (n) => `${n}'` },
    { unit: 'in', text: (n) => `${n}"` },
  ],
  { separator: '' },
);

/** Masses as pounds and whole ounces: `1 lb 4 oz`, `12 oz`. For `mass()`. */
export const poundsOunces: Formatter<Quantity<string>> = compoundFormatter('poundsOunces', massUnits, [
  { unit: 'lb', text: (n) => `${n} lb` },
  { unit: 'oz', text: (n) => `${n} oz` },
]);

/** Masses as stones and whole pounds, as UK body weight is written: `11 st 4 lb`. For `mass()`. */
export const stonesPounds: Formatter<Quantity<string>> = compoundFormatter('stonesPounds', massUnits, [
  { unit: 'st', text: (n) => `${n} st` },
  { unit: 'lb', text: (n) => `${n} lb` },
]);

/** Durations as hours and whole minutes, written compactly: `2h 30min`, `2h`, `45min`. Days show as hours. For `duration()`. */
export const hoursMinutes: Formatter<Quantity<string>> = compoundFormatter(
  'hoursMinutes',
  durationUnits,
  [
    { unit: 'h', text: (n) => `${n}h` },
    { unit: 'min', text: (n) => `${n}min` },
  ],
  { trailingZeros: false },
);

// Intl formatters (display-only) ---------------------------------------------------------------------

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
const cached = <F extends Intl.NumberFormat | Intl.DateTimeFormat>(key: string, make: () => F): F => {
  let f = cache.get(key) as F | undefined;
  if (!f) {
    f = make();
    cache.set(key, f);
  }
  return f;
};

/** Built-in unit IDs that have an Intl unit. Others fall back to the number and the unit ID. */
const INTL_UNITS: Readonly<Record<string, string>> = {
  mm: 'millimeter', cm: 'centimeter', m: 'meter', km: 'kilometer', in: 'inch', ft: 'foot', yd: 'yard', mi: 'mile',
  mg: 'milligram', g: 'gram', kg: 'kilogram', oz: 'ounce', lb: 'pound', st: 'stone',
  ms: 'millisecond', s: 'second', min: 'minute', h: 'hour', d: 'day', wk: 'week',
  C: 'celsius', F: 'fahrenheit', ml: 'milliliter', l: 'liter', floz: 'fluid-ounce', gal: 'gallon',
  ha: 'hectare', ac: 'acre', kmh: 'kilometer-per-hour', mph: 'mile-per-hour', mps: 'meter-per-second',
};

/**
 * Quantities with Intl's localized unit names: `5 ft`, `5 feet`, `5 Fuß`. Display-only. Units without an
 * Intl unit print the number and the unit ID.
 */
export function intlUnit(options?: { readonly unitDisplay?: 'short' | 'long' | 'narrow'; readonly maximumFractionDigits?: number }): Formatter<Quantity<string>> {
  const unitDisplay = options?.unitDisplay ?? 'short';
  const maximumFractionDigits = options?.maximumFractionDigits ?? 3;
  return (value, ctx) => {
    const tag = ctx.locale.tag;
    const unit = INTL_UNITS[value.unit];
    if (!unit) {
      return `${cached(`n|${tag}|${maximumFractionDigits}`, () => new Intl.NumberFormat(tag, { maximumFractionDigits })).format(value.value)} ${value.unit}`;
    }
    const f = cached(`u|${tag}|${unit}|${unitDisplay}|${maximumFractionDigits}`, () => new Intl.NumberFormat(tag, { style: 'unit', unit, unitDisplay, maximumFractionDigits }));
    return f.format(value.value);
  };
}
