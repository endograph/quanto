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

/** Durations: `90 min`, `1.5 h`, `2h30m`, `1 wk 2 d`. */
export const duration = <C extends DurationUnit = DurationUnit>(options?: QuantityOptions<DurationUnit, C>): QuantityCodec<DurationUnit, C> =>
  quantity<typeof durationUnits, C>({ id: 'duration', units: durationUnits, ...options });
