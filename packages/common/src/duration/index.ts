import {
  approx, defineCodec, normalize, quantity,
  type Approx, type Codec, type CodecOptions, type Ctx, type DefaultUnit, type Quantity, type ResolvedCtx, type StandardSchemaV1, type QuantityCodec, type QuantityOptions, type UnitDefinition,
} from 'quanto';

/**
 * Fixed-length duration units, milliseconds through weeks. Base unit: the second. Months and years
 * have no fixed length, so they're only in `approximateDurationUnits`.
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

/**
 * `durationUnits` plus months and years at their average Gregorian length: a year is 365.2425 days and a
 * month a twelfth of that (30.436875 days), so twelve months are exactly a year. For estimates only: a
 * calendar month is 28 to 31 days, and an offset from a date is `dateOffset` in `@quantojs/datetime`.
 */
export const approximateDurationUnits: typeof durationUnits & {
  readonly mo: UnitDefinition;
  readonly yr: UnitDefinition;
} = {
  ...durationUnits,
  mo: { toBase: 2629746, aliases: ['mo', 'mos', 'mth', 'mths', 'month', 'months'] },
  yr: { toBase: 31556952, aliases: ['yr', 'yrs', 'y', 'year', 'years'], subunit: 'mo' },
};

export type ApproximateDurationUnit = keyof typeof approximateDurationUnits;

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

/** A quantity codec that reads clock notation as compound input first. */
const withClock = <U extends string, C extends U>(codec: QuantityCodec<U, C>, clock: 'h:mm' | 'm:ss'): QuantityCodec<U, C> => ({
  ...codec,
  parse: (text, ctx) => codec.parse(fromClock(text, clock), ctx),
});

/** Durations: `90 min`, `1.5 h`, `2h30m`, `1 wk 2 d`, and clock notation: `1:30`, `1:30:15`, `1:30 min`. */
export const duration = <C extends DurationUnit = DurationUnit>(options?: DurationOptions<C>): QuantityCodec<DurationUnit, C> => {
  const { clock = 'h:mm', ...rest } = options ?? {};
  return withClock(quantity<typeof durationUnits, C>({ id: 'duration', units: durationUnits, ...rest }), clock);
};

/** Options for `approximateDuration`. The `schema` and `format` see the whole `{ value, approximate }`. */
export interface ApproximateDurationOptions<C extends ApproximateDurationUnit = ApproximateDurationUnit>
  extends CodecOptions<Approx<Quantity<C>>> {
  /** What a bare number means. A month or a year here makes every bare number approximate. */
  readonly defaultUnit?: DefaultUnit<ApproximateDurationUnit> | undefined;
  /** Always convert the parsed value to this unit. Narrows the value type to `Approx<Quantity<C>>`. */
  readonly canonicalUnit?: C | undefined;
  /** What two-part clock notation with no unit means, as for `duration`. */
  readonly clock?: 'h:mm' | 'm:ss' | undefined;
}

/** A codec for approximate durations, which `convert` and `compare` accept for its quantities. */
export interface ApproximateDurationCodec<C extends ApproximateDurationUnit = ApproximateDurationUnit> extends Codec<Approx<Quantity<C>>> {
  readonly units: typeof approximateDurationUnits;
}

const isCalendar = (unit: string): boolean => unit === 'mo' || unit === 'yr';

/**
 * The default unit for the fixed-length check: the same when it's fixed-length, none when it's a month or a
 * year (so a bare number counts as calendar). One per system must agree, since the check can't see the locale.
 */
function fixedDefault(defaultUnit: DefaultUnit<ApproximateDurationUnit> | undefined): DefaultUnit<DurationUnit> | undefined {
  if (defaultUnit === undefined) return undefined;
  const units = typeof defaultUnit === 'string' ? [defaultUnit] : [defaultUnit.us, defaultUnit.uk, defaultUnit.metric];
  if (units.every(isCalendar)) return undefined;
  if (units.some(isCalendar)) {
    throw new Error('quanto: approximateDuration\'s defaultUnit mixes months or years with fixed-length units across systems. Use one kind for every system.');
  }
  return defaultUnit as DefaultUnit<DurationUnit>;
}

/**
 * Durations that may be rough, as `{ value, approximate }`: `duration`'s units plus months and years at
 * their average length (see `approximateDurationUnits`). Months and years are always approximate, since
 * a month is 28 to 31 days: `3 months` is `{ value: 3 mo, approximate: true }`, even with a `canonicalUnit`
 * that converts it to days. Any other unit is approximate when marked as `approx` marks it (`about 3 days`,
 * `2h-ish`), and exact otherwise. Formats as `~3 mo`. Pass the codec to `convert` and `compare` for the
 * quantity inside: `convert(codec, value.value, 'd')`.
 */
export function approximateDuration<C extends ApproximateDurationUnit = ApproximateDurationUnit>(
  options?: ApproximateDurationOptions<C>,
): ApproximateDurationCodec<C> {
  const { clock = 'h:mm', defaultUnit, canonicalUnit, schema, format } = options ?? {};
  const inner = withClock(quantity<typeof approximateDurationUnits, C>({ id: 'approximateDuration', units: approximateDurationUnits, defaultUnit, canonicalUnit }), clock);
  const marked = approx(inner);
  // Text this reads uses no month or year, so it's only as approximate as its markers say.
  const fixed = approx(duration({ clock, defaultUnit: fixedDefault(defaultUnit) }));
  // Durations never read the clock, so the inner codecs need only the locale and grammars.
  const plain = (ctx: ResolvedCtx): Ctx => ({ locale: ctx.locale.tag, grammars: ctx.grammars });

  const codec = defineCodec<Approx<Quantity<C>>>({
    id: 'approximateDuration',
    parse(text, ctx) {
      const result = marked.parse(text, plain(ctx));
      if (!result.ok) return { ok: false, issues: result.issues };
      // A value held in months or years is approximate however it was written (`canonicalUnit: 'mo'`).
      const exact = fixed.parse(text, plain(ctx)).ok && !isCalendar(result.value.value.unit);
      return { ok: true, value: exact ? result.value : { ...result.value, approximate: true } };
    },
    format: (value, ctx) => marked.format(value, plain(ctx)),
    check(value) {
      const shape = marked.schema['~standard'].validate(value) as StandardSchemaV1.Result<Approx<Quantity<C>>>;
      if (shape.issues) return shape.issues.map((i) => ({ message: i.message, ...(i.path ? { path: i.path.map((k) => (typeof k === 'object' ? k.key : k)) } : {}) }));
      return isCalendar(shape.value.value.unit) && !shape.value.approximate ? [{ message: 'A month or a year is approximate: expected approximate: true.', path: ['approximate'] }] : [];
    },
    options: { schema, format },
  });
  return { ...codec, units: approximateDurationUnits };
}
