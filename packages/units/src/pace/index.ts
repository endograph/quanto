import { defineCodec, normalize, readNumber, type ParseOutcome, type Quantity, type ResolvedCtx } from 'quanto';
import { convert } from 'quanto/quantity';
import { assertQuantityOptions, checkQuantity, resolveDefaultUnit, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto/codecs';

/**
 * Pace units: seconds per kilometer and seconds per mile. Base unit: seconds per kilometer. The first
 * alias is what `format` prints after the time.
 */
export const paceUnits: {
  readonly sPerKm: UnitDefinition;
  readonly sPerMi: UnitDefinition;
} = {
  sPerKm: { toBase: 1, aliases: ['/km', 'per km', '/kilometer', '/kilometre', 'per kilometer', 'per kilometre'] },
  sPerMi: { toBase: 1 / 1.609344, aliases: ['/mi', 'per mi', '/mile', 'per mile'] },
};

export type PaceUnit = keyof typeof paceUnits;

/** `m:ss` or `h:mm:ss`, with an optional fraction of a second. */
const CLOCK = /^(\d+):([0-5]\d)(?::([0-5]\d))?(?:[.,](\d+))?/;
/** An optional minutes word between the time and the unit: `5:30 min/km`, `8 minutes per mile`. */
const MINUTES = /^(?:minutes|minute|mins|min)(?![\p{L}])\s*/u;
/** A unit-shaped tail that isn't a known unit: `/yd`, `per lap`. */
const UNKNOWN_UNIT = /^(?:\/|per\s+)\s*([\p{L}]+)$/u;

const unitByAlias = new Map<string, PaceUnit>(
  (Object.keys(paceUnits) as PaceUnit[]).flatMap((unit) => paceUnits[unit].aliases.map((alias) => [alias.toLowerCase(), unit] as const)),
);

const unparseable = (text: string): ParseOutcome<never> => ({
  ok: false,
  issues: [{ code: 'unparseable', message: `Couldn't understand "${text}" as a pace, like "5:30 /km".` }],
});

/** Reads the time part: clock notation, or a number of minutes. Returns seconds and where it ended. */
function readTime(s: string, ctx: ResolvedCtx): { seconds: number; end: number } | undefined {
  const clock = CLOCK.exec(s);
  if (clock) {
    const [a, b, c] = [Number(clock[1]), Number(clock[2]), clock[3] === undefined ? undefined : Number(clock[3])];
    const fraction = clock[4] === undefined ? 0 : Number(`0.${clock[4]}`);
    const seconds = c === undefined ? a * 60 + b + fraction : a * 3600 + b * 60 + c + fraction;
    return { seconds, end: clock[0].length };
  }
  const n = readNumber(s, ctx);
  if (!n || n.value < 0) return undefined;
  return { seconds: n.value * 60, end: n.end };
}

/**
 * Formats seconds as `m:ss` or `h:mm:ss`, to a tenth of a second. The fraction uses the locale's decimal
 * comma where it has one and a period otherwise, which is what `CLOCK` reads back.
 */
function formatTime(seconds: number, ctx: ResolvedCtx): string {
  const tenths = Math.round(seconds * 10);
  const h = Math.floor(tenths / 36000);
  const m = Math.floor((tenths % 36000) / 600);
  const sec = Math.floor((tenths % 600) / 10);
  const fraction = tenths % 10 ? `${ctx.locale.decimal === ',' ? ',' : '.'}${tenths % 10}` : '';
  const secText = `${String(sec).padStart(2, '0')}${fraction}`;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${secText}` : `${m}:${secText}`;
}

/**
 * Running and walking pace: `5:30 /km`, `8:00 per mile`, `5.5 min/km`, `1:05:00 /mi`. The value is a
 * quantity in seconds per km or per mile (`{ value: 330, unit: 'sPerKm' }`), so `convert` and `compare`
 * from `quanto/quantity` work on it. Formats as `5:30 /km`, to a tenth of a second.
 */
export const pace = <C extends PaceUnit = PaceUnit>(options?: QuantityOptions<PaceUnit, C>): QuantityCodec<PaceUnit, C> => {
  const { defaultUnit, canonicalUnit, schema, format } = options ?? {};
  assertQuantityOptions('pace', paceUnits, defaultUnit, canonicalUnit);

  const parse = (text: string, ctx: ResolvedCtx): ParseOutcome<Quantity<C>> => {
    const s = normalize(text).toLowerCase();
    const time = readTime(s, ctx);
    if (!time) return unparseable(text);
    const tail = s.slice(time.end).trim().replace(MINUTES, '').replace(/\s+/g, ' ');

    let unit: PaceUnit | undefined;
    if (tail === '') {
      unit = resolveDefaultUnit(defaultUnit, ctx.locale.measurementSystem);
      if (unit === undefined) {
        return { ok: false, issues: [{ code: 'missing_unit', message: `Add a unit, like "${formatTime(time.seconds, ctx)} /km".` }] };
      }
    } else {
      unit = unitByAlias.get(tail) ?? unitByAlias.get(tail.replace(/^\/ /, '/'));
      if (unit === undefined) {
        const word = UNKNOWN_UNIT.exec(tail);
        if (!word) return unparseable(text);
        return { ok: false, issues: [{ code: 'unknown_unit', message: `"${word[1]}" isn't a unit this field accepts.` }] };
      }
    }

    if (canonicalUnit === undefined || canonicalUnit === unit) return { ok: true, value: { value: time.seconds, unit: unit as C } };
    return { ok: true, value: { value: convert({ id: 'pace', units: paceUnits }, { value: time.seconds, unit }, canonicalUnit).value, unit: canonicalUnit } };
  };

  // Pace can't be negative: a negative number of seconds per km means nothing.
  const check = (value: unknown): Array<{ message: string; path?: PropertyKey[] }> => {
    const problems = checkQuantity(paceUnits, canonicalUnit, value);
    const v = (value as { value?: unknown } | null)?.value;
    if (problems.length === 0 && typeof v === 'number' && v < 0) problems.push({ message: 'Expected a non-negative number of seconds.', path: ['value'] });
    return problems;
  };

  const codec = defineCodec<Quantity<C>>({
    id: 'pace',
    parse,
    format: (value, ctx) => `${formatTime(value.value, ctx)} ${paceUnits[value.unit].aliases[0]}`,
    check,
    options: { schema, format },
  });
  return { ...codec, units: paceUnits as Readonly<Record<PaceUnit, UnitDefinition>> };
};
