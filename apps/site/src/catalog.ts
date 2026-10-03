// Every codec the playground offers, built from the real packages. Each entry keeps the source of
// its own construction, so the "in your app" snippet shows exactly what the page runs.
import type { Codec } from 'quanto';
import { anything } from '@quantojs/anything';
import * as q from '@quantojs/common';
import { feetInches, hoursMinutes, intlUnit, poundsOunces, stonesPounds } from '@quantojs/common/formats';
import { cssColor } from '@quantojs/common/css-color';
import { money } from '@quantojs/common/money';
import { odds } from '@quantojs/common/odds';
import { date, dateOffset, dateRange, dateTime, time } from '@quantojs/datetime';
import { de, es, fr, it, nl, pt } from '@quantojs/datetime/names';
import { coordinates } from '@quantojs/geo';
import { phoneNumber } from '@quantojs/libphonenumber';
import { pitch, timeSignature } from '@quantojs/music';
import { ringSize, shoeSize } from '@quantojs/sizes';

export interface Entry {
  readonly id: string;
  readonly codec: Codec<any>;
  /** Source for the codec, as an app would write it. */
  readonly call: string;
  readonly imports: Readonly<Record<string, readonly string[]>>;
  readonly examples: readonly string[];
  /** Alternative display formatters for this codec's values, shown under `format`. */
  readonly formatters?: readonly { readonly call: string; readonly codec: Codec<any> }[];
  /** Shown as a tab; the rest go in the "more" menu. */
  readonly featured?: boolean;
}

const names = [de, es, fr, it, nl, pt];
const namesCall = '{ names: [de, es, fr, it, nl, pt] }';
const namesImport = { '@quantojs/datetime/names': ['de', 'es', 'fr', 'it', 'nl', 'pt'] };

const quantity = (
  id: keyof typeof q & string,
  examples: string[],
  extra: Partial<Pick<Entry, 'formatters' | 'featured'>> = {},
): Entry => ({
  id,
  codec: (q[id] as () => Codec<any>)(),
  call: `${id}()`,
  imports: { '@quantojs/common': [id] },
  examples,
  ...extra,
});

const withFormat = (id: 'length' | 'mass' | 'duration', name: string, format: unknown) => ({
  call: `${id}({ format: ${name} })`,
  codec: (q[id] as (o: object) => Codec<any>)({ format }),
});

const leaves: Entry[] = [
  quantity('length', [`5'11"`, '180cm', '1,8 m', '5 ft 11 in', '1.500 km', '6½ in', '70', '70 kg'], {
    featured: true,
    formatters: [withFormat('length', 'feetInches', feetInches), withFormat('length', 'intlUnit()', intlUnit())],
  }),
  quantity('mass', ['1 lb 4 oz', '81.6 kg', '11 st 4 lb', '500 g', '3 cups'], {
    featured: true,
    formatters: [
      withFormat('mass', 'poundsOunces', poundsOunces),
      withFormat('mass', 'stonesPounds', stonesPounds),
      withFormat('mass', 'intlUnit()', intlUnit()),
    ],
  }),
  quantity('duration', ['2h30m', '90 min', '1 week 2 days', '1m', '3 months'], {
    featured: true,
    formatters: [withFormat('duration', 'hoursMinutes', hoursMinutes)],
  }),
  quantity('temperature', ['72°F', '22 °C', '-40F', '295.15 K', 'hot'], { featured: true }),
  quantity('volume', ['2 cups', '1.5 L', '12 fl oz', '1 gal']),
  quantity('area', ['1200 sq ft', '3 acres', '50 m²']),
  quantity('speed', ['65 mph', '100 km/h', '10 knots']),
  quantity('dataSize', ['1.5 GB', '500 MB', '2 TiB']),
  quantity('dataRate', ['100 Mbps', '1 Gbit/s']),
  quantity('compute', ['3.8e25 FLOP', '3640 PF-days']),
  quantity('computeRate', ['989 TFLOPS', '1.2 EFLOP/s']),
  quantity('energy', ['2000 kcal', '1 kWh']),
  quantity('power', ['250 W', '300 hp']),
  quantity('pressure', ['32 psi', '1 atm', '1013 hPa']),
  quantity('angle', ['90°', '1.57 rad']),
  quantity('frequency', ['2.4 GHz', '60 Hz']),
  quantity('fuelEconomy', ['30 mpg', '7.8 L/100km']),
  quantity('pace', ['5:30 /km', '8:00 min/mi']),
  quantity('torque', ['250 N·m', '184 lb-ft']),
  quantity('force', ['500 N', '100 lbf']),
  quantity('acceleration', ['9.8 m/s²', '3 g']),
  quantity('flowRate', ['12 L/min', '2.5 gpm', '400 cfm']),
  quantity('density', ['7.85 g/cm³', '62.4 lb/ft³']),
  quantity('voltage', ['230 V', '500 mV']),
  quantity('current', ['16 A', '500 mA']),
  quantity('resistance', ['4.7 kΩ', '220 ohms']),
  quantity('capacitance', ['100 µF', '22 pF']),
  quantity('charge', ['5000 mAh', '100 Ah']),
  quantity('luminousFlux', ['800 lm', '3000 lumens']),
  quantity('illuminance', ['500 lux', '50 fc']),
  quantity('luminance', ['1000 nits', '500 cd/m²']),
  quantity('colorTemperature', ['2700 K', '6500 kelvin', '153 mired']),
  quantity('radiationDose', ['2.4 mSv', '500 mrem']),
  quantity('absorbedDose', ['2 Gy', '180 cGy']),
  quantity('soundLevel', ['85 dB', '70 dBA']),
  quantity('number', ['1,234.5', '1.2k', '3 million']),
  quantity('percent', ['50%', '12.5 %', '0.5']),
  quantity('proportion', ['25 bps', '5‰', '420 ppm']),
  quantity('ratio', ['16:9', '3 in 10', '1:2:4']),
  {
    id: 'money',
    codec: money(),
    call: 'money()',
    imports: { '@quantojs/common/money': ['money'] },
    examples: ['$1,234.50', '€12,50', 'USD 12.99', '$1.2k', '¥500', '$3.459', '12 XYZ', '12'],
    featured: true,
  },
  {
    id: 'odds',
    codec: odds(),
    call: 'odds()',
    imports: { '@quantojs/common/odds': ['odds'] },
    examples: ['5/1', '2/1 on', '3.75', '+275', '150'],
  },
  {
    id: 'pitch',
    codec: pitch(),
    call: 'pitch()',
    imports: { '@quantojs/music': ['pitch'] },
    examples: ['A4', 'B♭3', 'C♯5 -12¢', 'Fis4', 'Sol4', '440 Hz', 'MIDI 60', 'F#'],
    // How a key spells the same notes. The key is ctx, not an option, so each is the default format under it.
    formatters: ['F major', 'F# major', 'D minor'].map((key) => ({
      call: `ctx.music.key = '${key}'`,
      codec: pitch({ format: (value, ctx) => pitch().format(value, { locale: ctx.locale.tag, music: { key } }) }),
    })),
  },
  {
    id: 'timeSignature',
    codec: timeSignature(),
    call: 'timeSignature()',
    imports: { '@quantojs/music': ['timeSignature'] },
    examples: ['6/8', '3+2+2/8', 'common time', 'alla breve', '4/3'],
  },
  {
    id: 'phoneNumber',
    codec: phoneNumber(),
    call: 'phoneNumber()',
    imports: { '@quantojs/libphonenumber': ['phoneNumber'] },
    examples: ['(415) 555-2671', '+44 20 7946 0958', '0049 30 123456'],
  },
  {
    id: 'coordinates',
    codec: coordinates(),
    call: 'coordinates()',
    imports: { '@quantojs/geo': ['coordinates'] },
    examples: ['40.7128, -74.0060', `40°42'46" N 74°0'22" W`, '849VCWC8+R9'],
  },
  {
    id: 'ringSize',
    codec: ringSize(),
    call: 'ringSize()',
    imports: { '@quantojs/sizes': ['ringSize'] },
    examples: ['US 7', 'N½', 'EU 54'],
  },
  {
    id: 'shoeSize',
    codec: shoeSize(),
    call: 'shoeSize()',
    imports: { '@quantojs/sizes': ['shoeSize'] },
    examples: ["men's 10", 'UK 9', 'EU 44', 'US 10'],
  },
  {
    id: 'cssColor',
    codec: cssColor(),
    call: 'cssColor()',
    imports: { '@quantojs/common/css-color': ['cssColor'] },
    examples: ['#00aaff', 'rebeccapurple', 'rgb(0 170 255 / 50%)', 'hsl(200 100% 50%)', 'oklch(0.7 0.15 230)', 'color(display-p3 1 0 0)', 'currentcolor'],
  },
  {
    id: 'date',
    codec: date({ names }),
    call: `date(${namesCall})`,
    imports: { '@quantojs/datetime': ['date'], ...namesImport },
    examples: ['tomorrow', 'next fri', 'Oct 2, 2026', '03/04/2026', '13/04', '2. Oktober 2026', '2 de octubre', 'someday'],
    featured: true,
  },
  {
    id: 'time',
    codec: time(),
    call: 'time()',
    imports: { '@quantojs/datetime': ['time'] },
    examples: ['3pm', '15:30', '3:30 p.m.', 'noon', '25:00'],
    featured: true,
  },
  {
    id: 'dateTime',
    codec: dateTime({ names }),
    call: `dateTime(${namesCall})`,
    imports: { '@quantojs/datetime': ['dateTime'], ...namesImport },
    examples: ['tomorrow 3pm', 'Oct 2 9am', 'next fri noon', '2026-10-02T15:00Z'],
  },
  {
    id: 'dateOffset',
    codec: dateOffset(),
    call: 'dateOffset()',
    imports: { '@quantojs/datetime': ['dateOffset'] },
    examples: ['3 days', '2 weeks before', 'in 6 months', '1 year and 6 months ago', 'P1M', '3 hours'],
  },
];

const range: Entry = {
  id: 'dateRange',
  codec: dateRange(date({ names })),
  call: `dateRange(date(${namesCall}))`,
  imports: { '@quantojs/datetime': ['date', 'dateRange'], ...namesImport },
  examples: ['Oct 3-5', 'Dec 30 - Jan 2', 'Oct 3 – Oct 10'],
};

// "any" tries every leaf codec in order and takes the first that parses; the rest come back as
// alternatives. Percent goes last among the quantities because it accepts a bare number. Time
// signatures stay out: `6/8` is a date, and `3/4` is already the example of a reading with alternatives.
const any: Entry = {
  id: 'any',
  codec: anything({ names, include: [phoneNumber()] }),
  call: `anything({ ${namesCall.slice(2, -2)}, include: [phoneNumber()] })`,
  imports: { '@quantojs/anything': ['anything'], '@quantojs/anything/phone': ['phoneNumber'], ...namesImport },
  examples: [`5'11"`, '1m', '€12,50', 'tomorrow 3pm', '24×36in', '(415) 555-2671', '40.7128, -74.006', '72°F', '3/4', 'hello'],
  featured: true,
};

export const entries: readonly Entry[] = [any, ...leaves, range];
export const byId: Readonly<Record<string, Entry>> = Object.fromEntries(entries.map((e) => [e.id, e]));
/** Codecs by the id `merge` tags values with. */
export const leafById: Readonly<Record<string, Entry>> = Object.fromEntries(leaves.map((e) => [e.codec.id, e]));

export { locales, musicKeys } from './choices';
