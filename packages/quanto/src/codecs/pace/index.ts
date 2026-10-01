import { quantity, type NumberSyntax, type QuantityCodec, type QuantityOptions, type UnitDefinition } from '../quantity';
import { readNumber } from '../../primitives/number';

/** The ways people write "per kilometer" or "per mile", with an optional minutes word: `/km`, `min/km`, `minutes per mile`. */
function paceAliases(unitWords: readonly string[]): string[] {
  const aliases: string[] = [];
  for (const minutes of ['', 'min', 'mins', 'minute', 'minutes']) {
    for (const word of unitWords) {
      aliases.push(`${minutes}/${word}`, `${minutes}/ ${word}`);
      if (minutes) aliases.push(`${minutes} /${word}`);
      aliases.push(minutes ? `${minutes} per ${word}` : `per ${word}`);
    }
  }
  return aliases;
}

/**
 * Pace units: seconds per kilometer and seconds per mile. Base unit: seconds per kilometer. The first
 * alias is what `format` prints after the time.
 */
export const paceUnits: {
  readonly sPerKm: UnitDefinition;
  readonly sPerMi: UnitDefinition;
} = {
  sPerKm: { toBase: 1, aliases: paceAliases(['km', 'kilometer', 'kilometre']) },
  sPerMi: { toBase: 1 / 1.609344, aliases: paceAliases(['mi', 'mile']) },
};

export type PaceUnit = keyof typeof paceUnits;

/** `m:ss` or `h:mm:ss`, with an optional fraction of a second. */
const CLOCK = /^(\d+):([0-5]\d)(?::([0-5]\d))?(?:[.,](\d+))?/;

/**
 * Pace's number syntax. Clock notation (`5:30`, `1:05:00`) reads as seconds; a plain number (`5.5`) is
 * minutes. Negative paces are rejected. Prints `m:ss` or `h:mm:ss` to a tenth of a second, with the
 * locale's decimal comma where it has one.
 */
const clockSyntax: NumberSyntax = {
  read(text, ctx, from) {
    let i = from;
    while (text[i] === ' ') i++;
    const clock = CLOCK.exec(text.slice(i));
    if (clock) {
      const [a, b, c] = [Number(clock[1]), Number(clock[2]), clock[3] === undefined ? undefined : Number(clock[3])];
      const fraction = clock[4] === undefined ? 0 : Number(`0.${clock[4]}`);
      const value = c === undefined ? a * 60 + b + fraction : a * 3600 + b * 60 + c + fraction;
      return { value, end: i + clock[0].length };
    }
    const n = readNumber(text, ctx, { from });
    if (!n || n.value < 0) return undefined;
    return { value: n.value * 60, end: n.end };
  },
  format(seconds, ctx) {
    const tenths = Math.round(seconds * 10);
    const h = Math.floor(tenths / 36000);
    const m = Math.floor((tenths % 36000) / 600);
    const sec = Math.floor((tenths % 600) / 10);
    const fraction = tenths % 10 ? `${ctx.locale.decimal === ',' ? ',' : '.'}${tenths % 10}` : '';
    const secText = `${String(sec).padStart(2, '0')}${fraction}`;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${secText}` : `${m}:${secText}`;
  },
};

/**
 * Running and walking pace: `5:30 /km`, `8:00 per mile`, `5.5 min/km`, `1:05:00 /mi`. A quantity in
 * seconds per km or per mile (`{ value: 330, unit: 'sPerKm' }`), so `convert`, `compare` and `range`
 * work on it. Formats as `5:30 /km`, to a tenth of a second.
 */
export const pace = <C extends PaceUnit = PaceUnit>(options?: QuantityOptions<PaceUnit, C>): QuantityCodec<PaceUnit, C> =>
  quantity<typeof paceUnits, C>({ id: 'pace', units: paceUnits, number: clockSyntax, ...options });
