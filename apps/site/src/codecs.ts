// Every codec the playground offers, built from the real packages. Each entry keeps the source of
// its own construction, so the "in your app" snippet shows exactly what the page runs.
import { merge, type Codec } from 'quanto';
import * as q from 'quanto/codecs';
import { feetInches, hoursMinutes, intlUnit, poundsOunces, stonesPounds } from 'quanto/formats';
import { money } from 'quanto/money';
import { date, dateRange, dateTime, time } from 'quanto-datetime';
import { de, es, fr, it, nl, pt } from 'quanto-datetime/names';

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
const namesImport = { 'quanto-datetime/names': ['de', 'es', 'fr', 'it', 'nl', 'pt'] };

const quantity = (
  id: keyof typeof q & string,
  examples: string[],
  extra: Partial<Pick<Entry, 'formatters' | 'featured'>> = {},
): Entry => ({
  id,
  codec: (q[id] as () => Codec<any>)(),
  call: `${id}()`,
  imports: { 'quanto/codecs': [id] },
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
  quantity('energy', ['2000 kcal', '1 kWh']),
  quantity('power', ['250 W', '300 hp']),
  quantity('pressure', ['32 psi', '1 atm', '1013 hPa']),
  quantity('angle', ['90°', '1.57 rad']),
  quantity('frequency', ['2.4 GHz', '60 Hz']),
  quantity('fuelEconomy', ['30 mpg', '7.8 L/100km']),
  quantity('pace', ['5:30 /km', '8:00 min/mi']),
  quantity('percent', ['50%', '12.5 %', '0.5']),
  {
    id: 'money',
    codec: money(),
    call: 'money()',
    imports: { 'quanto/money': ['money'] },
    examples: ['$1,234.50', '€12,50', 'USD 12.99', '$1.2k', '¥500', '$3.459', '12 XYZ', '12'],
    featured: true,
  },
  {
    id: 'date',
    codec: date({ names }),
    call: `date(${namesCall})`,
    imports: { 'quanto-datetime': ['date'], ...namesImport },
    examples: ['tomorrow', 'next fri', 'Oct 2, 2026', '03/04/2026', '13/04', '2. Oktober 2026', '2 de octubre', 'someday'],
    featured: true,
  },
  {
    id: 'time',
    codec: time(),
    call: 'time()',
    imports: { 'quanto-datetime': ['time'] },
    examples: ['3pm', '15:30', '3:30 p.m.', 'noon', '25:00'],
    featured: true,
  },
  {
    id: 'dateTime',
    codec: dateTime({ names }),
    call: `dateTime(${namesCall})`,
    imports: { 'quanto-datetime': ['dateTime'], ...namesImport },
    examples: ['tomorrow 3pm', 'Oct 2 9am', 'next fri noon', '2026-10-02T15:00Z'],
  },
];

const range: Entry = {
  id: 'dateRange',
  codec: dateRange(date({ names })),
  call: `dateRange(date(${namesCall}))`,
  imports: { 'quanto-datetime': ['date', 'dateRange'], ...namesImport },
  examples: ['Oct 3-5', 'Dec 30 - Jan 2', 'Oct 3 – Oct 10'],
};

// "any" tries every leaf codec in order and takes the first that parses; the rest come back as
// alternatives. Percent goes last among the quantities because it accepts a bare number.
const anyOrder = leaves.filter((e) => e.id !== 'percent').concat(leaves.filter((e) => e.id === 'percent'));
const mergeImports: Record<string, string[]> = { quanto: ['merge'] };
for (const e of anyOrder) {
  for (const [from, list] of Object.entries(e.imports)) {
    mergeImports[from] = [...new Set([...(mergeImports[from] ?? []), ...list])];
  }
}

export const any: Entry = {
  id: 'any',
  codec: merge(anyOrder.map((e) => e.codec)),
  call: `merge([\n  ${anyOrder.map((e) => e.call).join(',\n  ')},\n])`,
  imports: mergeImports,
  examples: [`5'11"`, '1m', '€12,50', 'tomorrow 3pm', '72°F', '1.5 GB', '3/4', '65 mph', 'hello'],
  featured: true,
};

export const entries: readonly Entry[] = [any, ...leaves, range];
export const byId: Readonly<Record<string, Entry>> = Object.fromEntries(entries.map((e) => [e.id, e]));
/** Codecs by the id `merge` tags values with. */
export const leafById: Readonly<Record<string, Entry>> = Object.fromEntries(leaves.map((e) => [e.codec.id, e]));

export const locales = ['en-US', 'en-GB', 'en-CA', 'en-IN', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'pt-BR', 'nl-NL', 'de-CH'];
