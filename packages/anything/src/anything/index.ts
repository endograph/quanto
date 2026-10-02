import { approx, defineRange, dimensions, merge, range, type Approx, type Codec, type CodecOptions, type MergedCodec, type QuantityCodec, type Tagged } from 'quanto';
import {
  absorbedDose, acceleration, angle, area, capacitance, charge, compute, computeRate, current, dataRate, dataSize, density, duration, energy,
  flowRate, force, frequency, fuelEconomy, illuminance, length, luminance, luminousFlux, mass, number, pace, power, pressure, proportion,
  radiationDose, ratio, resistance, soundLevel, speed, temperature, torque, voltage, volume,
} from '@quantojs/common';
import { money, moneyRange } from '@quantojs/common/money';
import { odds } from '@quantojs/common/odds';
import { date, dateRange, dateTime, time, type Names } from '@quantojs/datetime';
import { coordinates } from '@quantojs/geo';
import { pitch } from '@quantojs/music';
import { ringSize, shoeSize } from '@quantojs/sizes';

/** Options for `anything`. */
export interface AnythingOptions extends CodecOptions<AnythingValue> {
  /** Month and weekday names to accept besides English, for dates: `[de]`, `[es, fr]`. */
  readonly names?: readonly Names[] | undefined;
  /**
   * More codecs to read, after the built-in ones and before the catch-alls (plain numbers, ratios and
   * odds), so they see `4155552671` before `number` does. Phone numbers come this way, so that their
   * metadata is only in apps that ask for it, and can load lazily: `include: [phoneNumber()]`, with
   * `phoneNumber` from `@quantojs/anything/phone`.
   */
  readonly include?: readonly Codec<unknown>[] | undefined;
}

/** Every quantity, each also read as a range. Length, mass, duration and temperature come first, before money. */
const quantities = () =>
  ({
    length: length(),
    mass: mass(),
    duration: duration(),
    temperature: temperature(),
    speed: speed(),
    power: power(),
    dataSize: dataSize(),
    angle: angle(),
    volume: volume(),
    area: area(),
    pressure: pressure(),
    energy: energy(),
    frequency: frequency(),
    fuelEconomy: fuelEconomy(),
    pace: pace(),
    dataRate: dataRate(),
    computeRate: computeRate(),
    compute: compute(),
    torque: torque(),
    force: force(),
    acceleration: acceleration(),
    flowRate: flowRate(),
    density: density(),
    voltage: voltage(),
    current: current(),
    resistance: resistance(),
    capacitance: capacitance(),
    charge: charge(),
    luminousFlux: luminousFlux(),
    illuminance: illuminance(),
    luminance: luminance(),
    soundLevel: soundLevel(),
    radiationDose: radiationDose(),
    absorbedDose: absorbedDose(),
    proportion: proportion(),
  }) as const;

function members(options: AnythingOptions | undefined) {
  const q = quantities();
  const { length, mass, duration, temperature, ...rest } = q;
  const names = options?.names;
  const [d, t, dt, m, p] = [date({ names }), time(), dateTime({ names }), money(), pitch()];
  const singles = [
    d,
    t,
    dt,
    // Before length, which reads `24 × 36 in` as a product.
    dimensions(length, { count: { min: 2, max: 3 } }),
    length,
    mass,
    duration,
    temperature,
    // After length, since it reads `ft` as the forint.
    m,
    // Before frequency: `455hz` is a pitch.
    p,
    // The rest of the quantities: mass reads `g` before acceleration, temperature `C` and `F` before charge
    // and capacitance, angle `rad` before absorbed dose, and rates of compute come before amounts.
    ...Object.values(rest),
    coordinates(),
    ringSize(),
    shoeSize(),
  ] as const;
  // Last of the single values: they'd read too much (`70` as decimal odds, `+275` as a number).
  const catchAlls = [number(), ratio(), odds()] as const;
  const ranges = [dateRange(d), dateRange(t), dateRange(dt), ...(Object.values(q) as QuantityCodec<string>[]).map((c) => range(c)), moneyRange(m), defineRange(p)] as const;
  return { singles, catchAlls, ranges, include: options?.include ?? [] };
}

/**
 * The value of `anything()`: a member's value, tagged with the id of the codec that read it, and whether
 * it was marked approximate. Switch on `value.codec` to know what `value.value` is.
 */
export type AnythingValue = Approx<Tagged<unknown>>;

const build = (options: AnythingOptions | undefined): MergedCodec<unknown> => {
  const { singles, catchAlls, ranges, include } = members(options);
  return merge([...singles, ...include, ...catchAlls, ...ranges]);
};

/**
 * One codec that reads anything quanto can: dates and times, money, every quantity, dimensions,
 * coordinates, ring and shoe sizes, pitches, then plain numbers, ratios and odds, each quantity, date and
 * amount of money also as a range, and all of it optionally approximate (`about 6 ft`). The first codec
 * that reads the text wins and the others' readings are its alternatives, so the order settles every
 * conflict: see the package README. The value is tagged with the id of the codec that read it:
 * `{ value: { codec: 'length', value: { value: 180, unit: 'cm' } }, approximate: false }`. When nothing
 * reads it, the issues are the first of each informative code from its members (`unknown_unit`,
 * `ambiguous`, …), or else one `unparseable`.
 */
export function anything(options?: AnythingOptions): Codec<AnythingValue> {
  const codec = approx(build(options), { schema: options?.schema, format: options?.format });
  return {
    ...codec,
    id: 'anything',
    // Every member that can't read the text says so, most of them alike (forty quantities find no unit in
    // `70 bananas`). Keep the first issue of each informative code (`unknown_unit`, `ambiguous`, …), in
    // codec order, and when every member just couldn't read it, say that once.
    parse(text, ctx) {
      const result = codec.parse(text, ctx);
      if (result.ok) return result;
      const seen = new Set<string>();
      const telling = result.issues.filter((issue) => issue.code !== 'unparseable' && !seen.has(issue.code) && seen.add(issue.code));
      const issues = telling.length > 0 ? telling : [{ code: 'unparseable' as const, message: `Couldn't understand "${text.trim()}".` }];
      return { ...result, issues };
    },
  };
}
