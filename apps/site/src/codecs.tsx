// The codecs page: every first-party codec, what it reads, what it stores, and for quantities, the unit
// table itself. Nothing here is written out by hand that the packages already know: the unit tables are
// the codecs' own, the conversions come from `convert`, and every example is parsed and formatted live,
// in the locale picked in the header.
// Fragment is renamed: Bun's bundler loses track of a module's `<>` fragments when `Fragment` is also
// imported under its own name.
import { Fragment as Keyed, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { approx, dimensions, merge, optional, range, type Codec, type Ctx, type QuantityCodec, type UnitDefinition } from 'quanto';
import { convert } from 'quanto/quantity';
import * as q from '@quantojs/common';
import { feetInches, hoursMinutes, intlUnit, poundsOunces, stonesPounds } from '@quantojs/common/formats';
import { cssColor } from '@quantojs/common/css-color';
import { money, moneyRange } from '@quantojs/common/money';
import { odds } from '@quantojs/common/odds';
import { date, dateRange, dateTime, localDateTime, time } from '@quantojs/datetime';
import { de, es, fr, it, nl, pt } from '@quantojs/datetime/names';
import { coordinates, degreesMinutesSeconds } from '@quantojs/geo';
import { anything } from '@quantojs/anything';
import { phoneNumber } from '@quantojs/libphonenumber';
import { pitch, timeSignature } from '@quantojs/music';
import { ringSize, shoeSize } from '@quantojs/sizes';
import { locales, musicKeys } from './catalog';
import { Code } from './demo/omni';
import { cycleOnClick } from './mark';

/** Relative dates on this page resolve against a fixed moment, so the examples read the same for everyone. */
const NOW = '2026-09-30T14:02:11-04:00';

// ── The codecs ──────────────────────────────────────────────────────────

interface UnitDocs {
  /** A codec with a unit table: the core's quantity codecs, or a package's, like `pitch`. */
  readonly codec: Codec<any> & { readonly units: Readonly<Record<string, UnitDefinition>> };
  /** The unit every other unit is shown in. */
  readonly ref: string;
  /** How to write the reference unit in the table, when its first alias doesn't read well alone. */
  readonly refLabel?: string;
  /** The conversion, for units that aren't a plain factor (offsets, reciprocals). */
  readonly equals?: Readonly<Record<string, string>>;
}

interface Doc {
  readonly id: string;
  readonly group: Group;
  /** One line, for the index. */
  readonly summary: string;
  readonly from: string;
  readonly name: string;
  readonly call: string;
  /** Imports the snippet needs besides the codec itself. */
  readonly imports?: Readonly<Record<string, readonly string[]>>;
  /** Absent for an external codec, whose parse needs a server this page doesn't have: no live examples. */
  readonly codec?: Codec<any>;
  readonly examples: readonly string[];
  readonly about?: ReactNode;
  readonly units?: UnitDocs;
  readonly options?: readonly (readonly [string, ReactNode])[];
  /** The playground tab for this codec, if it has one. */
  readonly play?: string;
  /** Keys to offer for `ctx.music.key`, for codecs whose formatting follows it. */
  readonly keys?: readonly string[];
}

type Group = 'Quantities' | 'Money' | 'Dates and times' | 'Music' | 'Addresses' | 'Phone numbers' | 'Coordinates' | 'Sizes' | 'Colors' | 'Text and numbers' | 'Wrappers';
const groups: readonly Group[] = ['Quantities', 'Money', 'Dates and times', 'Music', 'Addresses', 'Phone numbers', 'Coordinates', 'Sizes', 'Colors', 'Text and numbers', 'Wrappers'];

/** A quantity codec's entry: the codec with its defaults, and its table. */
function quantity(
  name: keyof typeof q & string,
  summary: string,
  examples: string[],
  units: Omit<UnitDocs, 'codec'>,
  extra: Partial<Pick<Doc, 'about' | 'options'>> = {},
): Doc {
  const codec = (q[name] as () => QuantityCodec<string>)();
  return { id: name, group: 'Quantities', summary, from: '@quantojs/common', name, call: `${name}()`, codec, examples, units: { codec, ...units }, play: name, ...extra };
}

const names = [de, es, fr, it, nl, pt];

const docs: readonly Doc[] = [
  quantity('length', 'Heights, distances, sizes', [`5'11"`, '180cm', '1,8 m', '5 ft 11 in', '3 miles', '2k ft', '70'], { ref: 'm' }, {
    about: (
      <>
        Feet take inches as their subunit, so a trailing number after feet is inches: <code>5'11</code> is 5 ft 11 in. Nautical
        miles are <code>nmi</code>, never <code>nm</code>, which would read as nanometers somewhere else.
      </>
    ),
  }),
  quantity('mass', 'Body weight, ingredients, parcels', ['70 kg', '154 lbs', '1 lb 4 oz', '11 st 4', '500 g', '3 cups'], { ref: 'kg' }, {
    about: (
      <>
        Stones take pounds and pounds take ounces, so <code>11 st 4</code> is 11 st 4 lb. There's no <code>ton</code>: it means a
        different mass in the US, the UK and metric use. Use <code>t</code> for the metric tonne.
      </>
    ),
  }),
  quantity('duration', 'Timers, estimates, durations', ['90 min', '1.5 h', '2h30m', '1 wk 2 d', '1:30', '1:30 min', '3 months'], { ref: 's' }, {
    about: (
      <>
        Fixed-length units only, milliseconds through weeks. Months and years have no fixed length, so they aren't quantities.
        Clock notation is read as compound input: <code>1:30:15</code> is h:mm:ss, and <code>1:30</code> is h:mm unless a unit
        after it says otherwise (<code>1:30 min</code>).
      </>
    ),
    options: [['clock', <>What two-part clock notation with no unit means: <code>'h:mm'</code> (the default) or <code>'m:ss'</code>.</>]],
  }),
  quantity('temperature', 'Weather, cooking, body temperature', ['72°F', '22 °C', '-40 degrees fahrenheit', '295.15 K', '20°', 'hot'], {
    ref: 'C',
    equals: { F: '(x − 32) × 5⁄9 °C', K: 'x − 273.15 °C' },
  }, {
    about: (
      <>
        Celsius and Fahrenheit have an offset, so they don't add up: there's no compound input. A degree sign or word alone
        (<code>20°</code>, <code>20 degrees</code>) is a bare number, so it takes the <code>defaultUnit</code>.
      </>
    ),
  }),
  quantity('volume', 'Recipes, drinks, tanks', ['500 ml', '1,5 l', '2 cups', '12 fl oz', '1 gal', '2 tbsp'], { ref: 'l' }, {
    about: <>Customary units are US measures. UK imperial pints and gallons differ, and need a custom table.</>,
  }),
  quantity('area', 'Floor plans, land', ['1200 sq ft', '80 m²', '3 acres', '1 ha'], { ref: 'm2' }, {
    about: <><code>m²</code> and <code>m2</code> are the same alias after normalization.</>,
  }),
  quantity('speed', 'Vehicles, wind, running', ['65 mph', '100 km/h', '10 m/s', '20 knots'], { ref: 'kmh' }, {
    about: <>Speed has its own table; it isn't derived from length and duration.</>,
  }),
  quantity('pace', 'Running and walking', ['5:30 /km', '8:00 per mile', '5.5 min/km', '1:05:00 /mi'], {
    ref: 'sPerKm',
    refLabel: 's/km',
  }, {
    about: (
      <>
        Stored in seconds per km or per mile (<code>{'{ value: 330, unit: "sPerKm" }'}</code>), so <code>convert</code>,{' '}
        <code>compare</code> and <code>range</code> work on it. Clock notation is seconds; a plain number is minutes. Formats as{' '}
        <code>5:30 /km</code>, to a tenth of a second.
      </>
    ),
  }),
  quantity('dataSize', 'Files, storage, memory', ['500 MB', '1.5 GB', '4 GiB', '2 TB', '100b'], { ref: 'B' }, {
    about: (
      <>
        <code>KB</code>, <code>MB</code>, … are decimal (1000), as on drives and in macOS; <code>KiB</code>, <code>MiB</code>, … are
        binary (1024). There are no bit units here, so a lowercase <code>b</code> means bytes too.
      </>
    ),
  }),
  quantity('dataRate', 'Bandwidth, transfer speeds', ['100 Mbps', '1 Gbit/s', '12.5 MB/s', '12.5 mb/s'], { ref: 'Mbps' }, {
    about: (
      <>
        Bits and bytes differ only by case (<code>Mb/s</code>, <code>MB/s</code>), so those aliases match exactly as written.
        All-lowercase <code>mbps</code> is bits, the common case; <code>mb/s</code> is ambiguous and isn't accepted.
      </>
    ),
  }),
  quantity('compute', 'Training budgets, workloads', ['3.8e25 FLOP', '5 TFLOPs', '3640 PF-days', '989 TFLOP/s'], { ref: 'FLOP' }, {
    about: (
      <>
        A count of floating-point operations. <code>FLOPs</code> and <code>FLOPS</code> both mean a count here; rates, with{' '}
        <code>/s</code>, are <code>computeRate</code>. A <code>PF-day</code> is a petaflop/s for a day, 8.64×10¹⁹ FLOP.
      </>
    ),
  }),
  quantity('computeRate', 'GPUs, supercomputers', ['989 TFLOPS', '1.2 EFLOP/s', '3e14 flops', '989 TFLOP'], { ref: 'FLOPS' }, {
    about: (
      <>
        Floating-point operations per second. <code>TFLOPS</code>, <code>TFLOP/s</code> and <code>TFLOPs</code> all mean a rate
        here; a plain <code>TFLOP</code> is a count, and isn't accepted.
      </>
    ),
  }),
  quantity('energy', 'Food energy, electricity, heat', ['2000 kcal', '3.5 kWh', '100 kJ', '1000 BTU'], { ref: 'kJ' }, {
    about: <><code>cal</code>, <code>Cal</code> and <code>calories</code> mean kilocalories, as on food labels.</>,
  }),
  quantity('power', 'Engines, appliances, power plants', ['150 hp', '3 kW', '1.21 GW', '12000 BTU/h', '5 mW'], { ref: 'W' }, {
    about: (
      <>
        <code>mW</code> and <code>MW</code> differ only by case, so they match exactly as written. <code>hp</code> is mechanical
        horsepower; <code>PS</code> is metric horsepower.
      </>
    ),
  }),
  quantity('pressure', 'Tyres, weather, diving', ['32 psi', '2.2 bar', '1013 hPa', '29.92 inHg', '120/80'], { ref: 'kPa' }, {
    about: <>Compound readings like blood pressure (<code>120/80</code>) need a custom codec.</>,
  }),
  quantity('angle', 'Bearings, coordinates, rotation', ['45°', `40°26'46"`, '1.2 rad', '0.25 turn'], { ref: 'deg' }, {
    about: <>Degrees take arcminutes and arcminutes take arcseconds, so <code>40°26'46"</code> and <code>40°26</code> both work.</>,
  }),
  quantity('frequency', 'Radio, audio, rotation', ['440 Hz', '2.4 GHz', '3000 rpm'], { ref: 'Hz' }, {
    about: <>There's no millihertz, so <code>mhz</code> means megahertz. Beats per minute aren't included.</>,
  }),
  quantity('fuelEconomy', 'Cars', ['30 mpg', '7.8 L/100km', '15 km/L', '40 mpg (imp)'], {
    ref: 'kmpl',
    equals: { lp100km: '100 ÷ x km/L' },
  }, {
    about: (
      <>
        Stored against km per liter, so a bigger value is more efficient and <code>compare</code> orders from worst to best.
        L/100km is the reciprocal. <code>mpg</code> is US miles per gallon; UK is <code>mpg (imp)</code>.
      </>
    ),
  }),
  quantity('torque', 'Bolts, engines, wrenches', ['250 N·m', '184 lb-ft', '184 ft-lb', '35 in-lb'], { ref: 'Nm' }, {
    about: <>Pound-feet and foot-pounds are the same unit, written either way round.</>,
  }),
  quantity('force', 'Loads, thrust, grip', ['500 N', '2 kN', '100 lbf', '50 kgf'], { ref: 'N' }, {
    about: <><code>mN</code> and <code>MN</code> differ only by case, so they match exactly as written.</>,
  }),
  quantity('acceleration', 'Vehicles, sensors, rides', ['9.8 m/s²', '3 g', '32 ft/s²'], { ref: 'mps2' }, {
    about: <><code>g</code> is standard gravity, 9.80665 m/s².</>,
  }),
  quantity('flowRate', 'Pumps, plumbing, ventilation, IV drips', ['12 L/min', '2.5 gpm', '400 cfm', '5 m³/h', '125 mL/h'], { ref: 'Lps' }, {
    about: <>Gallons are US gallons, as in <code>volume</code>.</>,
  }),
  quantity('density', 'Materials, liquids', ['1000 kg/m³', '7.85 g/cm³', '62.4 lb/ft³', '8.34 lb/gal'], { ref: 'kgpm3' }),
  quantity('voltage', 'Batteries, mains, electronics', ['230 V', '3.3 V', '500 mV', '11 kV'], { ref: 'V' }, {
    about: <><code>mV</code> and <code>MV</code> differ only by case, so they match exactly as written.</>,
  }),
  quantity('current', 'Circuits, chargers, breakers', ['16 A', '500 mA', '20 µA'], { ref: 'A' }),
  quantity('resistance', 'Resistors, wiring', ['220 Ω', '4.7 kΩ', '10 kohm', '1 MΩ', '4.7k'], { ref: 'ohm' }, {
    about: (
      <>
        <code>mΩ</code> and <code>MΩ</code> differ only by case, so they match exactly as written. A bare <code>4.7k</code> needs a{' '}
        <code>defaultUnit</code>, as with any quantity.
      </>
    ),
  }),
  quantity('capacitance', 'Capacitors', ['100 µF', '100 uF', '10 nF', '22 pF'], { ref: 'F' }, {
    about: <><code>uF</code> stands in for <code>µF</code>, as on parts lists.</>,
  }),
  quantity('charge', 'Battery capacity', ['5000 mAh', '100 Ah', '1 C'], { ref: 'C' }, {
    about: <>Watt hours are energy, in <code>energy</code>.</>,
  }),
  quantity('luminousFlux', 'Bulbs, projectors, torches', ['800 lm', '3000 ANSI lumens', '2.5 klm'], { ref: 'lm' }, {
    about: <>How much light a source puts out. Light on a surface is <code>illuminance</code>; a screen's brightness is <code>luminance</code>.</>,
  }),
  quantity('illuminance', 'Rooms, plants, photography', ['500 lx', '50 fc', '100 klx'], { ref: 'lx' }),
  quantity('luminance', 'Screens, displays', ['1000 nits', '500 cd/m²', '14 fL'], { ref: 'nit' }),
  quantity('colorTemperature', 'Bulbs, white balance, smart lights', ['2700 K', '6500 kelvin', '153 mired', '370 mirek'], { ref: 'K' }, {
    about: <>A light's color temperature. Mireds are a million over the kelvin, as smart-light APIs take them. Heat is <code>temperature</code>.</>,
  }),
  quantity('proportion', 'Rates, spreads, concentrations', ['25 bps', '5‰', '12.5%', '420 ppm', '12.5'], { ref: 'percent' }, {
    about: (
      <>
        Unlike <code>percent</code>, the unit is kept, so <code>25 bps</code> stays basis points and converts to 0.25%.{' '}
        <code>ppt</code> is left out: it means parts per thousand and per trillion.
      </>
    ),
  }),
  quantity('soundLevel', 'Noise, hearing, audio', ['85 dB', '70 dBA', '100 dB(C)', '2 Pa', '80-90 dBA'], { ref: 'dB' }, {
    about: (
      <>
        Weighted readings (<code>dBA</code>, <code>dBC</code>) are on their own scales: they don't convert to unweighted dB or to
        each other, since the weighting depends on frequency. <code>convert</code> and <code>compare</code> across scales throw.
      </>
    ),
  }),
  quantity('radiationDose', 'Medical imaging, exposure', ['2.4 mSv', '10 µSv', '500 mrem'], { ref: 'Sv' }, {
    about: <>The dose to a person. Absorbed dose, in grays, is a different quantity: <code>absorbedDose</code>.</>,
  }),
  quantity('absorbedDose', 'Radiotherapy', ['2 Gy', '180 cGy', '50 rad'], { ref: 'Gy' }, {
    about: <>The dose to a person, in sieverts, is a different quantity: <code>radiationDose</code>.</>,
  }),
  {
    id: 'money',
    group: 'Money',
    summary: 'Prices, budgets, salaries',
    from: '@quantojs/common/money',
    name: 'money',
    call: 'money()',
    codec: money(),
    examples: ['$1,234.50', '€12,50', 'USD 12.99', '$1.2k', '12 bucks', 'five dollars and fifty cents', '¥500', '$3.459', '12 XYZ', '12'],
    play: 'money',
    about: (
      <>
        Amounts are integers in the currency's minor unit (<code>{'{ minorUnits: 123450, currency: "USD" }'}</code>), so there's no
        floating-point drift. Symbols, ISO codes and names are all read, along with magnitudes (<code>$1.2k</code>,{' '}
        <code>12 grand</code>, <code>$3mm</code>). An ambiguous symbol like <code>$</code> or <code>kr</code> goes to the{' '}
        <code>defaultCurrency</code>, then the locale's currency, then the most common one. Too many decimals for the currency is an
        issue, not a rounding. Every active ISO 4217 code is known, with its minor digits; <code>@quantojs/common/money</code> also exports{' '}
        <code>add</code>, <code>subtract</code>, <code>scale</code>, <code>allocate</code>, <code>compare</code> and <code>convert</code>.
      </>
    ),
    options: [['defaultCurrency', <>What a bare number means, and which currency an ambiguous symbol means. Without it, <code>12</code> is a <code>missing_currency</code> issue.</>]],
  },
  {
    id: 'moneyRange',
    group: 'Money',
    summary: 'Price ranges',
    from: '@quantojs/common/money',
    name: 'moneyRange',
    call: 'moneyRange(money())',
    imports: { '@quantojs/common/money': ['money'] },
    codec: moneyRange(money()),
    examples: ['$10-20', '10-20 EUR', '$10-20k', '$500-1k'],
    about: <>A side borrows the other's currency and, where that keeps the range in order, its magnitude suffix. With <code>open: true</code>, also one bound: <code>$500+</code>, <code>under $20</code>.</>,
    options: [['open', <>Accept a single bound, and store <code>null</code> for the missing side.</>]],
  },
  {
    id: 'date',
    group: 'Dates and times',
    summary: 'Calendar dates, as YYYY-MM-DD',
    from: '@quantojs/datetime',
    name: 'date',
    call: 'date({ names: [de, es, fr, it, nl, pt] })',
    imports: { '@quantojs/datetime/names': ['de', 'es', 'fr', 'it', 'nl', 'pt'] },
    codec: date({ names }),
    examples: ['tomorrow', 'next fri', 'Oct 2, 2026', '2026-10-02', '03/04/2026', '13/04', '2. Oktober 2026', '2 de octubre', 'someday'],
    play: 'date',
    about: (
      <>
        Stores an ISO date string. Relative dates resolve against <code>ctx.now</code>: in a browser leave it out, on a server pass
        the user's. Numeric dates follow the locale's order (<code>03/04</code> is March 4 in en-US and 3 April in en-GB), and a
        date that only reads one way, like <code>13/04</code>, is read that way. English names are built in; other languages are
        opt-in data from <code>@quantojs/datetime/names</code>.
      </>
    ),
    options: [['names', <>Month and weekday names to accept besides English, in priority order. <code>format</code> uses the set matching the locale.</>]],
  },
  {
    id: 'time',
    group: 'Dates and times',
    summary: 'Times of day, as HH:MM:SS',
    from: '@quantojs/datetime',
    name: 'time',
    call: 'time()',
    codec: time(),
    examples: ['3pm', '15:30', '3:30 p.m.', 'noon', 'midnight', '25:00'],
    play: 'time',
  },
  {
    id: 'localDateTime',
    group: 'Dates and times',
    summary: 'A date and time, no offset',
    from: '@quantojs/datetime',
    name: 'localDateTime',
    call: 'localDateTime()',
    codec: localDateTime(),
    examples: ['tomorrow 3pm', 'Oct 2 9am', '2026-10-02 15:00'],
    about: <>A wall-clock date and time with no UTC offset, for things that happen at a local time wherever they are.</>,
  },
  {
    id: 'dateTime',
    group: 'Dates and times',
    summary: 'An instant, with its UTC offset',
    from: '@quantojs/datetime',
    name: 'dateTime',
    call: 'dateTime({ names: [de, es, fr, it, nl, pt] })',
    imports: { '@quantojs/datetime/names': ['de', 'es', 'fr', 'it', 'nl', 'pt'] },
    codec: dateTime({ names }),
    examples: ['tomorrow 3pm', 'Oct 2 9am', 'next fri noon', '2026-10-02T15:00Z'],
    play: 'dateTime',
    about: <>Keeps the UTC offset the time was entered in. Time zone names aren't read.</>,
  },
  {
    id: 'dateRange',
    group: 'Dates and times',
    summary: 'Spans of dates or times',
    from: '@quantojs/datetime',
    name: 'dateRange',
    call: 'dateRange(date())',
    imports: { '@quantojs/datetime': ['date'] },
    codec: dateRange(date({ names })),
    examples: ['Oct 3-5', 'Dec 30 - Jan 2', 'Oct 3 – Oct 10', 'October 3 to 5'],
    play: 'dateRange',
    about: (
      <>
        Works with all four codecs: <code>dateRange(time())</code> reads <code>9-5pm</code>, and over <code>localDateTime()</code>{' '}
        it reads <code>Oct 3 10pm-1am</code>. A side borrows what it's missing from the other, and an end before the start rolls into
        the next day or year. With <code>open: true</code>, also one bound: <code>after Oct 3</code>, <code>until Friday</code>.
      </>
    ),
    options: [['open', <>Accept a single bound.</>]],
  },
  {
    id: 'pitch',
    group: 'Music',
    summary: 'Notes, tuning, frequencies',
    from: '@quantojs/music',
    name: 'pitch',
    call: 'pitch()',
    codec: pitch(),
    examples: ['A4', 'B♭3', 'C♯5 -12¢', 'A4 +15¢', 'Fis4', 'B4', 'Sol4', 'Si♭3', '440 Hz', 'MIDI 60', 'F#'],
    play: 'pitch',
    units: { codec: pitch(), ref: 'Hz', equals: { note: '440 × 2^((x − 69) ⁄ 12) Hz' } },
    keys: musicKeys,
    about: (
      <>
        Stored as a MIDI note number with cents as the fraction (<code>{'{ value: 69.15, unit: "note" }'}</code> for{' '}
        <code>A4 +15¢</code>), or in Hz, so <code>convert</code> turns notes into frequencies. Names follow the locale: in de-DE{' '}
        <code>B4</code> is B♭ and <code>H4</code> is B, with <code>Fis</code> and <code>Es</code>, and solfège (<code>Sol4</code>,{' '}
        <code>Si♭3</code>) reads everywhere. <code>format</code> spells notes the way <code>ctx.music.key</code> does: pick a key
        above the examples. Without one, it uses sharps.
      </>
    ),
    options: [
      ['a4', <>The tuning: A4's frequency. Default 440.</>],
      ['middleC', <>Middle C's octave: 4 (the default) or 3, as Yamaha and French usage number it.</>],
      ['defaultOctave', <>The octave of a note written without one. Without it, <code>F#</code> asks for an octave.</>],
      ['defaultUnit', <>What a bare number means: <code>'Hz'</code> or <code>'note'</code>.</>],
      ['canonicalUnit', <><code>'Hz'</code> stores every pitch as a frequency, <code>'note'</code> as a MIDI number.</>],
    ],
  },
  {
    id: 'timeSignature',
    group: 'Music',
    summary: 'Meters, as numerator and denominator',
    from: '@quantojs/music',
    name: 'timeSignature',
    call: 'timeSignature()',
    codec: timeSignature(),
    examples: ['4/4', '6/8', '3+2+2/8', 'common time', '𝄵', 'alla breve', '4/3'],
    play: 'timeSignature',
    about: (
      <>
        Stored as <code>{'{ numerator: 6, denominator: 8 }'}</code>, never reduced: <code>6/8</code> isn't <code>3/4</code>.
        Additive meters keep their <code>groups</code>. The bottom number is a note value, from 1 to 64.
      </>
    ),
  },
  {
    id: 'address',
    group: 'Addresses',
    summary: 'Mailing addresses, parsed by libpostal',
    from: '@quantojs/libpostal',
    name: 'address',
    call: "address({ libpostal, defaultCountry: 'US' })",
    examples: ['1600 amphitheatre pkwy, mountain view, california 94043', 'Hauptstraße 5, 10115 Berlin, Deutschland', '10 Downing St, London sw1a2aa, UK'],
    about: (
      <>
        An external codec: <a href="https://github.com/openvenues/libpostal" target="_blank" rel="noopener">libpostal</a>, an
        open-source address parser trained on over a billion addresses, splits the text into parts on your server (its model is about
        2 GB, so it isn't a dependency: you pass the function that runs it). The codec keeps the text as typed, turns regions and
        postal codes into their country's form (<code>California</code> → <code>CA</code>, <code>sw1a2aa</code> →{' '}
        <code>SW1A 2AA</code>), names the country by ISO code, and formats in each country's order. It doesn't check that an address
        exists, and has no completions. There are no live examples here: parsing needs libpostal running.
      </>
    ),
    options: [
      ['libpostal', <>A function from text to libpostal's <code>[{'{ label, value }'}]</code>: node-postal in-process (<code>async (text) =&gt; postal.parser.parse_address(text)</code>), or a request to a libpostal service.</>],
      ['defaultCountry', <>The ISO code for addresses that don't name a country. Formatting leaves it out.</>],
    ],
  },
  {
    id: 'phoneNumber',
    group: 'Phone numbers',
    summary: 'Phone numbers, as E.164',
    from: '@quantojs/libphonenumber',
    name: 'phoneNumber',
    call: 'phoneNumber()',
    codec: phoneNumber(),
    examples: ['(415) 555-2671', '+44 20 7946 0958', '0049 30 123456', 'tel:+1-415-555-2671', '+1 415 555 2671 ext. 123', '555-2671', '1-800-FLOWERS'],
    play: 'phoneNumber',
    about: (
      <>
        Stored as an E.164 string (<code>'+14155552671'</code>), with an extension as <code>;ext=123</code>. A number without a
        country code is read in <code>defaultCountry</code>, else the locale's region, so the same digits can be different numbers in
        different locales. Parsing requires a valid number per libphonenumber-js's metadata; a stored one need only be the right
        length, so it stays readable after a metadata update.
      </>
    ),
    options: [
      ['defaultCountry', <>The ISO code for numbers written without a country code. Without it, the locale's region.</>],
      ['style', <><code>'international'</code> (the default, <code>+1 415 555 2671</code>) or <code>'national'</code> (<code>(415) 555-2671</code>), for numbers that read back in the field's country.</>],
    ],
  },
  {
    id: 'coordinates',
    group: 'Coordinates',
    summary: 'Latitude and longitude, plus codes, geohashes',
    from: '@quantojs/geo',
    name: 'coordinates',
    call: 'coordinates()',
    codec: coordinates(),
    examples: ['40.7128, -74.0060', '40.7128° N, 74.0060° W', `40°42'46" N 74°0'22" W`, "40°42.767' N 74°0.367' W", 'lat 40.7128, lng -74.006', '849VCWC8+R9', '-74.0060, 40.7128', '95, 40'],
    play: 'coordinates',
    about: (
      <>
        Stored as <code>{'{ lat, lng }'}</code> in decimal degrees. A bare pair is latitude first, as map apps copy it;{' '}
        <code>order: 'lngLat'</code> reads GeoJSON's order. A pair that's out of range is never swapped silently: when the swapped
        reading fits, it's offered as an alternative. Plus codes read as the center of their area. <code>@quantojs/geo</code> also
        exports <code>toPlusCode</code>, <code>toGeohash</code>, <code>distance</code> and formatters for the other notations.
      </>
    ),
    options: [
      ['order', <><code>'latLng'</code> (the default) or <code>'lngLat'</code>, for bare pairs. Letters and labels make the order free.</>],
      ['geohash', <>Also read geohashes (<code>dr5regw3p</code>), of 5 characters or more. Off by default: ordinary words can be geohashes.</>],
    ],
  },
  {
    id: 'ringSize',
    group: 'Sizes',
    summary: 'Ring sizes, US, UK, EU and diameter',
    from: '@quantojs/sizes',
    name: 'ringSize',
    call: 'ringSize()',
    codec: ringSize(),
    examples: ['US 7', '7½ US', 'N½', 'UK N', 'EU 54', '17.3 mm diameter', '54 mm', '7'],
    play: 'ringSize',
    about: (
      <>
        A quantity over the ring's inner circumference, so <code>convert</code> and <code>compare</code> work; every system is
        defined exactly. Letters are UK sizes. <code>54 mm</code> is the circumference, as ISO 8653 has it, with the diameter as an
        alternative. <code>nearestSize</code> rounds a conversion to the target system's steps.
      </>
    ),
  },
  {
    id: 'shoeSize',
    group: 'Sizes',
    summary: 'Adult shoe sizes, US, UK, EU and Mondopoint',
    from: '@quantojs/sizes',
    name: 'shoeSize',
    call: 'shoeSize()',
    codec: shoeSize(),
    examples: ["men's 10", 'US W 8', 'UK 9', 'EU 44', '27 cm', '270 mm', 'US 10', '5C', '10'],
    play: 'shoeSize',
    about: (
      <>
        A quantity over the foot's length. A US size needs its fit, written or from the <code>fit</code> option; otherwise it's{' '}
        <code>ambiguous</code>. Conversions follow the sizing formulas, not a retail chart, so US men's 10 is EU 42.6 where most charts
        say 44. Kids' sizes and widths aren't read.
      </>
    ),
    options: [
      ['fit', <><code>'mens'</code> or <code>'womens'</code>: what a plain <code>US 10</code> means.</>],
      ['defaultUnit', <>What a bare number means, one system or one per measurement system: <code>{"{ us: 'usMen', uk: 'uk', metric: 'eu' }"}</code>.</>],
    ],
  },
  {
    id: 'cssColor',
    group: 'Colors',
    summary: 'Every CSS color: hex, names, rgb(), hsl(), oklch(), color()',
    from: '@quantojs/common/css-color',
    name: 'cssColor',
    call: 'cssColor()',
    codec: cssColor(),
    examples: ['#00aaff', '#0af8', 'rebeccapurple', 'rgb(0 170 255 / 50%)', 'rgba(0, 170, 255, 0.5)', 'hsl(200 100% 50%)', 'oklch(70% 0.15 230deg)', 'color(display-p3 1 0 0)', '0, 170, 255', 'currentcolor'],
    play: 'cssColor',
    about: (
      <>
        Stored as <code>{'{ space, coords, alpha }'}</code>, in the space it was written in: nothing is converted. Formats as hex when
        the channels are whole bytes, and otherwise in the color's own function. Colors with no value of their own (
        <code>currentcolor</code>, system colors, <code>light-dark()</code>) and computed ones (<code>color-mix()</code>, relative
        colors) aren't read.
      </>
    ),
    options: [
      ['bare', <>Also read hex without <code>#</code> and three channels from 0 to 255 (<code>0, 170, 255</code>). On by default; turn it off where other values share the field.</>],
    ],
  },
  {
    id: 'number',
    group: 'Text and numbers',
    summary: 'Counts, quantities, amounts',
    from: '@quantojs/common',
    name: 'number',
    call: 'number()',
    codec: q.number(),
    examples: ['1,234.5', '1.2k', '3 million', 'twelve', '6.02×10^23', '12 kg'],
    play: 'number',
    about: <>A plain number with no unit. Integers and bounds are the <code>schema</code>'s job.</>,
  },
  {
    id: 'percent',
    group: 'Text and numbers',
    summary: 'Rates, shares, discounts',
    from: '@quantojs/common',
    name: 'percent',
    call: 'percent()',
    codec: q.percent(),
    examples: ['12.5%', '%12.5', '12.5 percent', '50', '3/4'],
    play: 'percent',
    about: (
      <>
        The value is the percentage as a plain number (<code>12.5</code>, not <code>0.125</code>), and a bare number is a percentage.
        Bare fractions aren't accepted. For basis points and per mille, use <code>proportion</code>; for ratios, <code>ratio</code>.
      </>
    ),
  },
  {
    id: 'odds',
    group: 'Text and numbers',
    summary: 'Betting odds',
    from: '@quantojs/common/odds',
    name: 'odds',
    call: 'odds()',
    codec: odds(),
    examples: ['5/1', '11/4', '2/1 on', 'evens', '3.75', '+275', '-110', '25%', '150'],
    play: 'odds',
    about: (
      <>
        Fractional, decimal and American odds, kept in the notation typed: <code>11/4</code> is{' '}
        <code>{"{ kind: 'fractional', numerator: 11, denominator: 4 }"}</code>. A bare <code>150</code> could be +150 or 150.0, so it's{' '}
        <code>ambiguous</code>, with both as alternatives. <code>@quantojs/common/odds</code> also exports <code>toDecimal</code>,{' '}
        <code>impliedProbability</code>, <code>convert</code> and <code>compare</code>.
      </>
    ),
    options: [['canonicalKind', <>Store every value in one notation, which also says what a bare <code>150</code> means.</>]],
  },
  {
    id: 'ratio',
    group: 'Text and numbers',
    summary: 'Aspect ratios, odds, mixes',
    from: '@quantojs/common',
    name: 'ratio',
    call: 'ratio()',
    codec: q.ratio(),
    examples: ['16:9', '2.39:1', '1:2:4', '3 in 10', '1 to 3', '3/4'],
    play: 'ratio',
    about: (
      <>
        Stored as written, as an array of terms: <code>16:9</code> is <code>[16, 9]</code>, not reduced and not divided out.
        Colons take any number of terms; <code>to</code>, <code>in</code>, <code>out of</code> and <code>/</code> take two.
      </>
    ),
  },
  {
    id: 'text',
    group: 'Text and numbers',
    summary: 'Anything, trimmed',
    from: '@quantojs/common',
    name: 'text',
    call: 'text()',
    codec: q.text(),
    examples: ['  hello  ', 'anything at all', '   '],
    about: <>The value is what was typed, trimmed. Validate it with <code>schema</code>. It's what a quanto field with no other codec uses.</>,
  },
  {
    id: 'optional',
    group: 'Wrappers',
    summary: 'Allows empty input',
    from: 'quanto',
    name: 'optional',
    call: 'optional(length())',
    imports: { '@quantojs/common': ['length'] },
    codec: optional(q.length()),
    examples: ['', '5 ft'],
    about: <>Blank input parses to <code>null</code>, and <code>null</code> formats as <code>''</code>. Without it, every codec reports blank input as an <code>empty</code> issue.</>,
  },
  {
    id: 'approx',
    group: 'Wrappers',
    summary: 'Marks a value approximate',
    from: 'quanto',
    name: 'approx',
    call: 'approx(length())',
    imports: { '@quantojs/common': ['length'] },
    codec: approx(q.length()),
    examples: ['~5 ft', 'about 180 cm', '5 ft or so', '5-ish ft', '5 ft'],
    about: <>Wraps any codec, ranges included: <code>approx(range(length()))</code> reads <code>about 5-7 ft</code>.</>,
  },
  {
    id: 'range',
    group: 'Wrappers',
    summary: 'Ranges of a quantity',
    from: 'quanto',
    name: 'range',
    call: 'range(length(), { open: true })',
    imports: { '@quantojs/common': ['length'] },
    codec: range(q.length(), { open: true }),
    examples: ['5-7 ft', '150 to 180 cm', '5+ ft', 'under 7 ft'],
    about: (
      <>
        Takes any quantity codec. A side with no unit borrows the other's. For other kinds of value use their package's range
        (<code>dateRange</code>, <code>moneyRange</code>), or build one with <code>defineRange</code>.
      </>
    ),
    options: [['open', <>Accept a single bound: <code>5+ ft</code>, <code>under 7 ft</code>.</>]],
  },
  {
    id: 'dimensions',
    group: 'Wrappers',
    summary: 'Several values written together',
    from: 'quanto',
    name: 'dimensions',
    call: 'dimensions(length(), { count: { min: 2, max: 3 } })',
    imports: { '@quantojs/common': ['length'] },
    codec: dimensions(q.length(), { count: { min: 2, max: 3 } }),
    examples: ['24 × 36 in', '24x36in', '2 m × 50 cm', "5' by 8'", '24 x 36 x 10 cm', '24 cm', '24 in × 36'],
    about: (
      <>
        Wraps any codec: <code>dimensions(number(), {'{ count: 2 }'})</code> reads <code>1920x1080</code>. A unit after the last
        part applies to the bare numbers before it.
      </>
    ),
    options: [['count', <>Required. A whole number, or <code>{'{ min, max }'}</code>, inclusive. Too many or too few parts is <code>wrong_count</code>.</>]],
  },
  {
    id: 'merge',
    group: 'Wrappers',
    summary: 'Any of several codecs',
    from: 'quanto',
    name: 'merge',
    call: 'merge([length(), mass(), duration()])',
    imports: { '@quantojs/common': ['length', 'mass', 'duration'] },
    codec: merge([q.length(), q.mass(), q.duration()]),
    examples: ['180 cm', '70 kg', '1m', '90 min'],
    play: 'any',
    about: (
      <>
        Earlier codecs win, and every other reading comes back in <code>alternatives</code>, for the person to choose. The value is
        tagged with the codec that read it: <code>{'{ codec: "length", value: … }'}</code>.
      </>
    ),
  },
  {
    id: 'anything',
    group: 'Wrappers',
    summary: 'Everything, in one codec',
    from: '@quantojs/anything',
    name: 'anything',
    call: 'anything({ include: [phoneNumber()] })',
    imports: { '@quantojs/anything/phone': ['phoneNumber'] },
    codec: anything({ include: [phoneNumber()] }),
    examples: ['next fri', '24×36in', 'about 6 ft', '$10-20k', '455hz', '(415) 555-2671', '40.7128, -74.006', '70', '70 bananas'],
    play: 'any',
    about: (
      <>
        A <code>merge</code> of every first-party codec, in <code>approx</code>, in an order that settles each conflict:{' '}
        <code>24 × 36 in</code> is dimensions, <code>455hz</code> a pitch, <code>70</code> a number. Phone numbers are opt-in through{' '}
        <code>include</code>, from <code>@quantojs/anything/phone</code>, since their metadata is about 80 kB; import it dynamically to
        load it later. It's the field on this site's home page.
      </>
    ),
    options: [
      ['include', <>More codecs, read after the built-in ones and before the catch-alls (numbers, ratios, odds).</>],
      ['names', <>Month and weekday names for dates, as for <code>date</code>.</>],
    ],
  },
];

/** The compound formatters, each over a value to show it off. */
const formatters = [
  { call: 'length({ format: feetInches })', codec: q.length({ format: feetInches }), values: [{ value: 180, unit: 'cm' }, { value: 6, unit: 'ft' }] },
  { call: 'mass({ format: poundsOunces })', codec: q.mass({ format: poundsOunces }), values: [{ value: 1.25, unit: 'lb' }, { value: 0.5, unit: 'kg' }] },
  { call: 'mass({ format: stonesPounds })', codec: q.mass({ format: stonesPounds }), values: [{ value: 72, unit: 'kg' }] },
  { call: 'duration({ format: hoursMinutes })', codec: q.duration({ format: hoursMinutes }), values: [{ value: 150, unit: 'min' }, { value: 1.5, unit: 'd' }] },
  { call: 'length({ format: intlUnit() })', codec: q.length({ format: intlUnit() }), values: [{ value: 180, unit: 'cm' }] },
  { call: "length({ format: intlUnit({ unitDisplay: 'long' }) })", codec: q.length({ format: intlUnit({ unitDisplay: 'long' }) }), values: [{ value: 3, unit: 'mi' }] },
];

// ── Rendering ───────────────────────────────────────────────────────────

const number = (n: number, locale: string): string => new Intl.NumberFormat(locale, { maximumSignificantDigits: 7 }).format(n);

/** One unit in terms of the reference unit: `1 ft = 0.3048 m`. */
function equals(docs: UnitDocs, unit: string, def: UnitDefinition, locale: string): ReactNode {
  if (unit === docs.ref) return <span className="muted">reference</span>;
  const override = docs.equals?.[unit];
  if (override) return override;
  if (def.scale !== docs.codec.units[docs.ref]!.scale) return <span className="muted">own scale ({def.scale ?? 'default'}), doesn't convert</span>;
  if (typeof def.toBase !== 'number') return '—';
  const refLabel = docs.refLabel ?? docs.codec.units[docs.ref]!.aliases[0]!;
  const value = convert(docs.codec, { value: 1, unit }, docs.ref).value;
  return `${number(value, locale)} ${refLabel}`;
}

/** The aliases after the first, which the codec reads but doesn't print. Long lists fold. */
function Aliases({ aliases }: { aliases: readonly string[] }) {
  const chip = (a: string) => <code key={a} className="alias">{a}</code>;
  if (aliases.length <= 10) return <>{aliases.map(chip)}</>;
  return (
    <>
      {aliases.slice(0, 8).map(chip)}
      <details className="more-aliases">
        <summary>+{aliases.length - 8} more</summary>
        {aliases.slice(8).map(chip)}
      </details>
    </>
  );
}

function Units({ docs, locale }: { docs: UnitDocs; locale: string }) {
  const units = Object.entries(docs.codec.units);
  return (
    <div className="scroll">
      <table className="units">
        <thead>
          <tr>
            <th>unit</th>
            <th>prints as</th>
            <th>1 unit =</th>
            <th>then</th>
            <th>also reads</th>
          </tr>
        </thead>
        <tbody>
          {units.map(([unit, def]) => (
            <tr key={unit}>
              <td><code className="unit-id">{JSON.stringify(unit)}</code></td>
              <td><code>{def.aliases[0]}</code></td>
              <td className="eq">{equals(docs, unit, def, locale)}</td>
              <td>{def.subunit ? <code>{docs.codec.units[def.subunit]!.aliases[0]}</code> : null}</td>
              <td className="aliases"><Aliases aliases={def.aliases.slice(1)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function tryFormat(codec: Codec<any>, value: unknown, ctx: Ctx): string {
  try {
    return codec.format(value, ctx);
  } catch (err) {
    return `⚠ ${(err as Error).message}`;
  }
}

/** One input, parsed and formatted: the value, or the issues. */
function Row({ codec, text, ctx, input }: { codec: Codec<any>; text: string; ctx: Ctx; input?: ReactNode }) {
  const result = codec.parse(text, ctx);
  const alternatives = result.alternatives?.length ?? 0;
  return (
    <tr className={result.ok ? undefined : 'bad'}>
      <td className="input">{input ?? <code>{JSON.stringify(text)}</code>}</td>
      {result.ok ? (
        <>
          <td className="value">
            <code><Code value={result.value} /></code>
            {alternatives > 0 && <span className="alts"> +{alternatives} alternative{alternatives > 1 ? 's' : ''}</span>}
          </td>
          <td><code>{JSON.stringify(tryFormat(codec, result.value, ctx))}</code></td>
        </>
      ) : (
        <td colSpan={2}>
          {result.issues.map((issue, i) => (
            <span key={i} className="issue">
              <span className="tag">{issue.code}</span> {issue.message}
            </span>
          ))}
        </td>
      )}
    </tr>
  );
}

function Examples({ doc, ctx }: { doc: Doc & { readonly codec: Codec<any> }; ctx: Ctx }) {
  const [text, setText] = useState('');
  return (
    <div className="scroll">
      <table className="examples">
        <thead>
          <tr>
            <th>parse(text)</th>
            <th>value</th>
            <th>format(value)</th>
          </tr>
        </thead>
        <tbody>
          {doc.examples.map((t) => (
            <Row key={t} codec={doc.codec} text={t} ctx={ctx} />
          ))}
          {text.trim() === '' ? (
            <tr className="try">
              <td className="input" colSpan={3}>
                <input className="text-field" value={text} placeholder="try your own…" aria-label={`Try ${doc.name}`} onChange={(e) => setText(e.target.value)} />
              </td>
            </tr>
          ) : (
            <Row
              codec={doc.codec}
              text={text}
              ctx={ctx}
              input={<input className="text-field" value={text} aria-label={`Try ${doc.name}`} autoFocus onChange={(e) => setText(e.target.value)} />}
            />
          )}
        </tbody>
      </table>
    </div>
  );
}

function Section({ doc, ctx: pageCtx }: { doc: Doc; ctx: Ctx }) {
  const [key, setKey] = useState('');
  const ctx: Ctx = key ? { ...pageCtx, music: { key } } : pageCtx;
  const imports: Record<string, readonly string[]> = { [doc.from]: [doc.name] };
  for (const [from, list] of Object.entries(doc.imports ?? {})) imports[from] = [...(imports[from] ?? []), ...list];
  return (
    <section className="codec-doc" id={doc.id}>
      <header className="codec-head">
        <h3>
          <a href={`#${doc.id}`}>{doc.name}</a>
        </h3>
        <span className="summary">{doc.summary}</span>
        {doc.play && (
          <a className="play" href={`../playground/index.html?codec=${doc.play}&locale=${ctx.locale}`}>
            playground →
          </a>
        )}
      </header>
      <pre className="snippet">
        {Object.entries(imports).map(([from, list]) => (
          <Keyed key={from}>
            <span className="j-k">import</span> {`{ ${list.join(', ')} }`} <span className="j-k">from</span> <span className="j-s">'{from}'</span>;{'\n'}
          </Keyed>
        ))}
        <span className="j-k">const</span> codec = {doc.call};
      </pre>
      {doc.about && <p className="about">{doc.about}</p>}
      {doc.options && (
        <dl className="options">
          {doc.options.map(([name, text]) => (
            <Keyed key={name}>
              <dt><code>{name}</code></dt>
              <dd>{text}</dd>
            </Keyed>
          ))}
        </dl>
      )}
      {doc.keys && (
        <label className="ctx key-pick">
          <span className="label">ctx.music.key</span>
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            <option value="">none (sharps)</option>
            {doc.keys.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
      )}
      {doc.codec && <Examples doc={doc as Doc & { readonly codec: Codec<any> }} ctx={ctx} />}
      {doc.units && (
        <>
          <p className="overline">units</p>
          <Units docs={doc.units} locale={ctx.locale!} />
        </>
      )}
    </section>
  );
}

function Formatters({ ctx }: { ctx: Ctx }) {
  return (
    <section className="codec-doc" id="formatters">
      <header className="codec-head">
        <h3>
          <a href="#formatters">formatters</a>
        </h3>
        <span className="summary">Other ways to print a quantity</span>
      </header>
      <pre className="snippet">
        <span className="j-k">import</span> {'{ feetInches, poundsOunces, stonesPounds, hoursMinutes, intlUnit }'} <span className="j-k">from</span> <span className="j-s">'@quantojs/common/formats'</span>;
      </pre>
      <p className="about">
        Pass one as a codec's <code>format</code> option. The compound ones print what the codec reads back, so they round-trip;{' '}
        <code>intlUnit</code> uses <code>Intl</code>'s localized unit names and is display-only.
      </p>
      <div className="scroll">
        <table className="examples">
          <thead>
            <tr>
              <th>codec</th>
              <th>value</th>
              <th>format(value)</th>
            </tr>
          </thead>
          <tbody>
            {formatters.flatMap((f) =>
              f.values.map((v, i) => (
                <tr key={`${f.call}${i}`}>
                  <td className="input"><code>{i === 0 ? f.call : ''}</code></td>
                  <td className="value"><code><Code value={v} /></code></td>
                  <td><code>{JSON.stringify(tryFormat(f.codec, v, ctx))}</code></td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Basics() {
  return (
    <section className="basics" id="basics">
      <h2>How a codec works</h2>
      <p>
        A codec turns what a person typed into a typed value, and the value back into text. <code>parse</code> never throws: it
        returns the value, or the issues to show. Store the value with the raw text; never re-parse the text to get the value back.
      </p>
      <pre className="snippet">
        <span className="j-k">const</span> result = length().parse(<span className="j-s">'5 ft 11 in'</span>, {'{ locale: '}<span className="j-s">'en-US'</span>{' }'});{'\n'}
        <span className="j-k">if</span> (result.ok) save({'{ raw: text, value: result.value }'});   <span className="j-p">// {'{ value: 71, unit: "in" }'}</span>{'\n'}
        <span className="j-k">else</span> show(result.issues);                         <span className="j-p">// [{'{ code: "unknown_unit", … }'}]</span>
      </pre>
      <div className="facts">
        <div>
          <h4>Quantities</h4>
          <p>
            Every quantity codec stores <code>{'{ value, unit }'}</code>, with the unit as the person entered it. Compound input
            (<code>5 ft 11 in</code>, <code>2h30m</code>) is summed into its smallest unit. <code>convert</code> and{' '}
            <code>compare</code> from <code>quanto/quantity</code> work on any of them.
          </p>
        </div>
        <div>
          <h4>Bare numbers</h4>
          <p>
            Without a unit, <code>70</code> is a <code>missing_unit</code> issue. Set <code>defaultUnit</code> to give it one, or one
            per measurement system: <code>{"{ us: 'in', uk: 'cm', metric: 'cm' }"}</code>, picked by the locale's region.
          </p>
        </div>
        <div>
          <h4>One unit out</h4>
          <p>
            <code>canonicalUnit: 'cm'</code> converts every value to that unit, and narrows the type to it. Every codec also takes{' '}
            <code>schema</code> (a Standard Schema, to validate) and <code>format</code> (to print differently).
          </p>
        </div>
        <div>
          <h4>Locales</h4>
          <p>
            <code>ctx.locale</code> decides the decimal separator (<code>1,8 m</code> in de-DE), date order, default currency and
            measurement system. Switch it in the header: every example on this page re-runs.
          </p>
        </div>
      </div>
    </section>
  );
}

function Index() {
  return (
    <section className="index" id="all">
      <h2>All codecs</h2>
      <div className="scroll">
        <table className="all">
          <thead>
            <tr>
              <th>codec</th>
              <th>import from</th>
              <th>for</th>
              <th>e.g.</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td><a href={`#${d.id}`}><code>{d.name}</code></a></td>
                <td><code className="muted">{d.from}</code></td>
                <td>{d.summary}</td>
                <td><code>{d.examples[0] || d.examples[1]}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Page({ locale }: { locale: string }) {
  const ctx: Ctx = { locale, now: NOW };
  // The sections render after the browser looked for the link's anchor, so go to it once they're here.
  useEffect(() => {
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }, []);
  return (
    <div className="layout">
      <nav className="toc" aria-label="Codecs">
        <a href="#basics">How a codec works</a>
        <a href="#all">All codecs</a>
        {groups.map((g) => (
          <Keyed key={g}>
            <p className="overline">{g}</p>
            {docs
              .filter((d) => d.group === g)
              .map((d) => (
                <a key={d.id} href={`#${d.id}`}><code>{d.name}</code></a>
              ))}
            {g === 'Quantities' && <a href="#formatters"><code>formatters</code></a>}
          </Keyed>
        ))}
      </nav>
      <div className="content">
        <Basics />
        <Index />
        {groups.map((g) => (
          <Keyed key={g}>
            <h2 className="group">{g}</h2>
            {g === 'Dates and times' && (
              <p className="note">
                From <code>@quantojs/datetime</code>. On this page, relative dates resolve against <code>ctx.now = '{NOW}'</code>.
              </p>
            )}
            {g === 'Addresses' && (
              <p className="note">
                From <code>@quantojs/libpostal</code>, an external codec: it runs on a server, beside libpostal.
              </p>
            )}
            {g === 'Phone numbers' && (
              <p className="note">
                From <code>@quantojs/libphonenumber</code>, built on libphonenumber-js. Which numbers are valid follows its metadata, which
                changes between releases.
              </p>
            )}
            {(g === 'Coordinates' || g === 'Sizes') && (
              <p className="note">
                From <code>{g === 'Coordinates' ? '@quantojs/geo' : '@quantojs/sizes'}</code>, which is still evolving: its parse results may
                change between releases.
              </p>
            )}
            {g === 'Music' && (
              <p className="note">
                From <code>@quantojs/music</code>, which is still evolving: its parse results may change between releases.
              </p>
            )}
            {docs
              .filter((d) => d.group === g)
              .map((d) => (
                <Section key={d.id} doc={d} ctx={ctx} />
              ))}
            {g === 'Quantities' && <Formatters ctx={ctx} />}
          </Keyed>
        ))}
      </div>
    </div>
  );
}

// ── The page ────────────────────────────────────────────────────────────

const select = document.getElementById('locale') as HTMLSelectElement;
const params = new URLSearchParams(location.search);
const initial = locales.includes(params.get('locale') ?? '') ? params.get('locale')! : 'en-US';
select.innerHTML = locales.map((l) => `<option${l === initial ? ' selected' : ''}>${l}</option>`).join('');

const root = createRoot(document.getElementById('root')!);
const render = (locale: string) => root.render(<Page locale={locale} />);
select.addEventListener('change', () => {
  const url = new URL(location.href);
  url.searchParams.set('locale', select.value);
  history.replaceState(null, '', url);
  render(select.value);
});
render(initial);

cycleOnClick(document.getElementById('mark-button')!, document.getElementById('mark')!);
