import { normalize } from '../../primitives/normalize';
import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from '../quantity';

/**
 * Fixed-length duration units, milliseconds through weeks. Base unit: the second. Months and years
 * have no fixed length, so they aren't quantities (see DESIGN.md, Deferred).
 */
export const durationUnits: {
  readonly ms: UnitDefinition;
  readonly s: UnitDefinition;
  readonly min: UnitDefinition;
  readonly h: UnitDefinition;
  readonly d: UnitDefinition;
  readonly wk: UnitDefinition;
} = {
  ms: { toBase: 0.001, aliases: ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'] },
  s: { toBase: 1, aliases: ['s', 'sec', 'secs', 'second', 'seconds'] },
  min: { toBase: 60, aliases: ['min', 'mins', 'minute', 'minutes', 'm'], subunit: 's' },
  h: { toBase: 3600, aliases: ['h', 'hr', 'hrs', 'hour', 'hours'], subunit: 'min' },
  d: { toBase: 86400, aliases: ['d', 'day', 'days'], subunit: 'h' },
  wk: { toBase: 604800, aliases: ['wk', 'wks', 'week', 'weeks', 'w'], subunit: 'd' },
};

export type DurationUnit = keyof typeof durationUnits;

/** Options for `duration`. */
export interface DurationOptions<C extends DurationUnit = DurationUnit> extends QuantityOptions<DurationUnit, C> {
  /** What two-part clock notation with no unit means: `1:30` as 1 h 30 min (`'h:mm'`, the default) or 1 min 30 s (`'m:ss'`). */
  readonly clock?: 'h:mm' | 'm:ss' | undefined;
}

/** Clock notation: `1:30`, `1:30:15`, `1:30.5`, with an optional unit after it that says what the first part is. */
const CLOCK = /^([-+]?)(\d+):([0-5]\d)(?::([0-5]\d))?([.,]\d+)?(?: ?([\p{L}]+)\.?)?$/u;
const HOURS = new Set(durationUnits.h.aliases);
const MINUTES = new Set(durationUnits.min.aliases);

/**
 * Rewrites clock notation as compound input, so it sums exactly like `1 h 30 min`: `h:mm:ss` always,
 * and `a:b` as `h:mm` or `m:ss` by the unit after it, a fraction (`1:30.5` is m:ss), or `clock`. Other
 * text, and clock notation with any other unit, is returned as is.
 */
function fromClock(text: string, clock: 'h:mm' | 'm:ss'): string {
  const m = CLOCK.exec(normalize(text).trim());
  if (!m) return text;
  const [, sign, a, b, c, fraction = '', word] = m;
  const unit = word?.toLowerCase();
  const hours = unit !== undefined && HOURS.has(unit);
  const minutes = unit !== undefined && MINUTES.has(unit);
  if (unit !== undefined && !hours && !minutes) return text;
  if (c !== undefined) return minutes ? text : `${sign}${a} h ${b} min ${c}${fraction} s`;
  return hours || (!minutes && !fraction && clock === 'h:mm') ? `${sign}${a} h ${b}${fraction} min` : `${sign}${a} min ${b}${fraction} s`;
}

/** Durations: `90 min`, `1.5 h`, `2h30m`, `1 wk 2 d`, and clock notation: `1:30`, `1:30:15`, `1:30 min`. */
export const duration = <C extends DurationUnit = DurationUnit>(options?: DurationOptions<C>): QuantityCodec<DurationUnit, C> => {
  const { clock = 'h:mm', ...rest } = options ?? {};
  const codec = quantity<typeof durationUnits, C>({ id: 'duration', units: durationUnits, ...rest });
  return { ...codec, parse: (text, ctx) => codec.parse(fromClock(text, clock), ctx) };
};
