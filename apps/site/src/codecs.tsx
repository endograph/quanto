// The codecs page: every built-in codec, what it reads, what it stores, and for quantities, the unit
// table itself. Nothing here is written out by hand that the packages already know: the unit tables are
// the codecs' own, the conversions come from `convert`, and every example is parsed and formatted live,
// in the locale picked in the header.
// Fragment is renamed: Bun's bundler loses track of a module's `<>` fragments when `Fragment` is also
// imported under its own name.
import { Fragment as Keyed, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { approx, merge, optional, range, type Codec, type Ctx, type UnitDefinition } from 'quanto';
import * as q from 'quanto/codecs';
import type { QuantityCodec } from 'quanto/codecs';
import { feetInches, hoursMinutes, intlUnit, poundsOunces, stonesPounds } from 'quanto/formats';
import { money, moneyRange } from 'quanto/money';
import { convert } from 'quanto/quantity';
import { date, dateRange, dateTime, localDateTime, time } from 'quanto-datetime';
import { de, es, fr, it, nl, pt } from 'quanto-datetime/names';
import { locales } from './catalog';
import { Code } from './demo/omni';
import { cycleOnClick } from './mark';

/** Relative dates on this page resolve against a fixed moment, so the examples read the same for everyone. */
const NOW = '2026-09-30T14:02:11-04:00';

// ── The codecs ──────────────────────────────────────────────────────────

interface UnitDocs {
  readonly codec: QuantityCodec<string>;
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
  readonly codec: Codec<any>;
  readonly examples: readonly string[];
  readonly about?: ReactNode;
  readonly units?: UnitDocs;
  readonly options?: readonly (readonly [string, ReactNode])[];
  /** The playground tab for this codec, if it has one. */
  readonly play?: string;
}

type Group = 'Quantities' | 'Money' | 'Dates and times' | 'Text and numbers' | 'Wrappers';
const groups: readonly Group[] = ['Quantities', 'Money', 'Dates and times', 'Text and numbers', 'Wrappers'];

/** A quantity codec's entry: the codec with its defaults, and its table. */
function quantity(
  name: keyof typeof q & string,
  summary: string,
  examples: string[],
  units: Omit<UnitDocs, 'codec'>,
  extra: Partial<Pick<Doc, 'about' | 'options'>> = {},
): Doc {
  const codec = (q[name] as () => QuantityCodec<string>)();
  return { id: name, group: 'Quantities', summary, from: 'quanto/codecs', name, call: `${name}()`, codec, examples, units: { codec, ...units }, play: name, ...extra };
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
  {
    id: 'money',
    group: 'Money',
    summary: 'Prices, budgets, salaries',
    from: 'quanto/money',
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
        issue, not a rounding. Every active ISO 4217 code is known, with its minor digits; <code>quanto/money</code> also exports{' '}
        <code>add</code>, <code>subtract</code>, <code>scale</code>, <code>allocate</code>, <code>compare</code> and <code>convert</code>.
      </>
    ),
    options: [['defaultCurrency', <>What a bare number means, and which currency an ambiguous symbol means. Without it, <code>12</code> is a <code>missing_currency</code> issue.</>]],
  },
  {
    id: 'moneyRange',
    group: 'Money',
    summary: 'Price ranges',
    from: 'quanto/money',
    name: 'moneyRange',
    call: 'moneyRange(money())',
    imports: { 'quanto/money': ['money'] },
    codec: moneyRange(money()),
    examples: ['$10-20', '10-20 EUR', '$10-20k', '$500-1k'],
    about: <>A side borrows the other's currency and, where that keeps the range in order, its magnitude suffix. With <code>open: true</code>, also one bound: <code>$500+</code>, <code>under $20</code>.</>,
    options: [['open', <>Accept a single bound, and store <code>null</code> for the missing side.</>]],
  },
  {
    id: 'date',
    group: 'Dates and times',
    summary: 'Calendar dates, as YYYY-MM-DD',
    from: 'quanto-datetime',
    name: 'date',
    call: 'date({ names: [de, es, fr, it, nl, pt] })',
    imports: { 'quanto-datetime/names': ['de', 'es', 'fr', 'it', 'nl', 'pt'] },
    codec: date({ names }),
    examples: ['tomorrow', 'next fri', 'Oct 2, 2026', '2026-10-02', '03/04/2026', '13/04', '2. Oktober 2026', '2 de octubre', 'someday'],
    play: 'date',
    about: (
      <>
        Stores an ISO date string. Relative dates resolve against <code>ctx.now</code>: in a browser leave it out, on a server pass
        the user's. Numeric dates follow the locale's order (<code>03/04</code> is March 4 in en-US and 3 April in en-GB), and a
        date that only reads one way, like <code>13/04</code>, is read that way. English names are built in; other languages are
        opt-in data from <code>quanto-datetime/names</code>.
      </>
    ),
    options: [['names', <>Month and weekday names to accept besides English, in priority order. <code>format</code> uses the set matching the locale.</>]],
  },
  {
    id: 'time',
    group: 'Dates and times',
    summary: 'Times of day, as HH:MM:SS',
    from: 'quanto-datetime',
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
    from: 'quanto-datetime',
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
    from: 'quanto-datetime',
    name: 'dateTime',
    call: 'dateTime({ names: [de, es, fr, it, nl, pt] })',
    imports: { 'quanto-datetime/names': ['de', 'es', 'fr', 'it', 'nl', 'pt'] },
    codec: dateTime({ names }),
    examples: ['tomorrow 3pm', 'Oct 2 9am', 'next fri noon', '2026-10-02T15:00Z'],
    play: 'dateTime',
    about: <>Keeps the UTC offset the time was entered in. Time zone names aren't read.</>,
  },
  {
    id: 'dateRange',
    group: 'Dates and times',
    summary: 'Spans of dates or times',
    from: 'quanto-datetime',
    name: 'dateRange',
    call: 'dateRange(date())',
    imports: { 'quanto-datetime': ['date'] },
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
    id: 'percent',
    group: 'Text and numbers',
    summary: 'Rates, shares, discounts',
    from: 'quanto/codecs',
    name: 'percent',
    call: 'percent()',
    codec: q.percent(),
    examples: ['12.5%', '%12.5', '12.5 percent', '50', '3/4'],
    play: 'percent',
    about: (
      <>
        The value is the percentage as a plain number (<code>12.5</code>, not <code>0.125</code>), and a bare number is a percentage.
        Ratios, basis points, per mille and bare fractions aren't accepted.
      </>
    ),
  },
  {
    id: 'text',
    group: 'Text and numbers',
    summary: 'Anything, trimmed',
    from: 'quanto/codecs',
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
    imports: { 'quanto/codecs': ['length'] },
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
    imports: { 'quanto/codecs': ['length'] },
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
    imports: { 'quanto/codecs': ['length'] },
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
    id: 'merge',
    group: 'Wrappers',
    summary: 'Any of several codecs',
    from: 'quanto',
    name: 'merge',
    call: 'merge([length(), mass(), duration()])',
    imports: { 'quanto/codecs': ['length', 'mass', 'duration'] },
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

function Examples({ doc, ctx }: { doc: Doc; ctx: Ctx }) {
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

function Section({ doc, ctx }: { doc: Doc; ctx: Ctx }) {
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
      <Examples doc={doc} ctx={ctx} />
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
        <span className="j-k">import</span> {'{ feetInches, poundsOunces, stonesPounds, hoursMinutes, intlUnit }'} <span className="j-k">from</span> <span className="j-s">'quanto/formats'</span>;
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
                From <code>quanto-datetime</code>. On this page, relative dates resolve against <code>ctx.now = '{NOW}'</code>.
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
