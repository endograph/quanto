// Ready-made formatters, for a codec's `format` option. See DESIGN.md, Formatting.
//
// - Compound formatters (`feetInches`, …) use bundled data only: deterministic, and they round-trip.
// - `intl*` formatters use Intl for richer, localized output. They're display-only: their output varies
//   between ICU versions and isn't guaranteed to parse back, so use them with `display="raw"` and never
//   set `raw` from them.

import { durationUnits } from '../codecs/duration';
import { lengthUnits } from '../codecs/length';
import { massUnits } from '../codecs/mass';
import { minorDigits } from '../codecs/money/currencies';
import type { UnitTable } from '../codecs/quantity';
import { convertValue, sumLinear } from '../codecs/quantity/convert';
import type { Money, Quantity, ResolvedCtx } from '../core/types';
import { formatNumber } from '../primitives/number';

/** A formatter for a codec's `format` option. */
export type Formatter<T> = (value: T, ctx: ResolvedCtx) => string;

// Compound formatters ---------------------------------------------------------------------------

interface Part {
  readonly unit: string;
  readonly text: (n: string) => string;
}

/**
 * Splits a quantity into whole parts, largest first (`[ft, in]`), rounding the smallest part to a
 * whole number and carrying into the larger ones. Leading zero parts are left out; the rest, including
 * trailing zeros, are kept (`6'0"`).
 */
function compound(name: string, units: UnitTable, parts: readonly Part[], separator = ' '): Formatter<Quantity<string>> {
  const smallest = parts[parts.length - 1]!;
  const factor = (unit: string): number => units[unit]!.toBase as number;
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
    const shown = first === -1 ? [counts.length - 1] : counts.map((_, i) => i).slice(first);
    const text = shown.map((i) => parts[i]!.text(formatNumber(counts[i]!, ctx, { maxFractionDigits: 0 }))).join(separator);
    return value.value < 0 && total !== 0 ? `-${text}` : text;
  };
}

/** Lengths as feet and whole inches: `5'11"`, `6'0"`, `11"`. For `length()`. */
export const feetInches: Formatter<Quantity<string>> = compound(
  'feetInches',
  lengthUnits,
  [
    { unit: 'ft', text: (n) => `${n}'` },
    { unit: 'in', text: (n) => `${n}"` },
  ],
  '',
);

/** Masses as pounds and whole ounces: `1 lb 4 oz`, `12 oz`. For `mass()`. */
export const poundsOunces: Formatter<Quantity<string>> = compound('poundsOunces', massUnits, [
  { unit: 'lb', text: (n) => `${n} lb` },
  { unit: 'oz', text: (n) => `${n} oz` },
]);

/** Masses as stones and whole pounds, as UK body weight is written: `11 st 4 lb`. For `mass()`. */
export const stonesPounds: Formatter<Quantity<string>> = compound('stonesPounds', massUnits, [
  { unit: 'st', text: (n) => `${n} st` },
  { unit: 'lb', text: (n) => `${n} lb` },
]);

/** Durations as hours and whole minutes: `2 h 30 min`, `45 min`. Days show as hours. For `duration()`. */
export const hoursMinutes: Formatter<Quantity<string>> = compound('hoursMinutes', durationUnits, [
  { unit: 'h', text: (n) => `${n} h` },
  { unit: 'min', text: (n) => `${n} min` },
]);

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

/**
 * Money in Intl's full currency styles: `US$12.34`, `12,34 €`, `12.34 US dollars`. Display-only. Decimal
 * places come from quanto's bundled table, not Intl's. Falls back to the amount and ISO code if Intl
 * doesn't know the currency.
 */
export function intlMoney(options?: { readonly currencyDisplay?: 'symbol' | 'narrowSymbol' | 'code' | 'name' }): Formatter<Money> {
  const currencyDisplay = options?.currencyDisplay ?? 'symbol';
  return (value, ctx) => {
    const digits = minorDigits(value.currency);
    const amount = value.minorUnits / 10 ** digits;
    const tag = ctx.locale.tag;
    try {
      const f = cached(`c|${tag}|${value.currency}|${currencyDisplay}`, () =>
        new Intl.NumberFormat(tag, { style: 'currency', currency: value.currency, currencyDisplay, minimumFractionDigits: digits, maximumFractionDigits: digits }),
      );
      return f.format(amount);
    } catch {
      return `${formatNumber(amount, ctx, { minFractionDigits: digits, maxFractionDigits: digits })} ${value.currency}`;
    }
  };
}

type DateStyle = 'full' | 'long' | 'medium' | 'short';

/** A UTC Date holding a wall-clock date and time, for formatting with `timeZone: 'UTC'`. */
function wallClock(y: number, m: number, d: number, h = 0, mi = 0, s = 0): Date {
  const date = new Date(Date.UTC(2000, m - 1, d, h, mi, s));
  date.setUTCFullYear(y);
  return date;
}

/** Dates (`2026-10-02`) in Intl's styles: `Friday, October 2, 2026`, `02/10/2026`. Display-only. */
export function intlDate(options?: { readonly dateStyle?: DateStyle }): Formatter<string> {
  const dateStyle = options?.dateStyle ?? 'medium';
  return (value, ctx) => {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    return cached(`d|${ctx.locale.tag}|${dateStyle}`, () => new Intl.DateTimeFormat(ctx.locale.tag, { dateStyle, timeZone: 'UTC' })).format(wallClock(y, m, d));
  };
}

/** Times (`15:00:00`) in Intl's styles: `3:00 PM`, `15:00`. Display-only. */
export function intlTime(options?: { readonly timeStyle?: DateStyle }): Formatter<string> {
  const timeStyle = options?.timeStyle ?? 'short';
  return (value, ctx) => {
    const [h, mi, s] = value.split(':').map(Number) as [number, number, number];
    return cached(`t|${ctx.locale.tag}|${timeStyle}`, () => new Intl.DateTimeFormat(ctx.locale.tag, { timeStyle, timeZone: 'UTC' })).format(wallClock(2000, 1, 1, h, mi, s));
  };
}

/**
 * Local date-times and date-times in Intl's styles: `Oct 2, 2026, 3:00 PM`. Shows the wall-clock time as
 * entered; a date-time's offset isn't shown. Display-only.
 */
export function intlDateTime(options?: { readonly dateStyle?: DateStyle; readonly timeStyle?: DateStyle }): Formatter<string> {
  const dateStyle = options?.dateStyle ?? 'medium';
  const timeStyle = options?.timeStyle ?? 'short';
  return (value, ctx) => {
    const [y, m, d, h, mi, s] = value.slice(0, 19).split(/[-T:]/).map(Number) as [number, number, number, number, number, number];
    return cached(`dt|${ctx.locale.tag}|${dateStyle}|${timeStyle}`, () => new Intl.DateTimeFormat(ctx.locale.tag, { dateStyle, timeStyle, timeZone: 'UTC' })).format(
      wallClock(y, m, d, h, mi, s),
    );
  };
}
