// The big field that reads anything: it types its own examples until someone takes it over, offers
// them as chips, and shows what it makes of the text. The demo page puts its switches above it; the
// landing page shows it as it comes.
import { Fragment, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { approx, defineRange, merge, range, type Codec, type Issue, type Quantity, type ResolvedCtx } from 'quanto';
import { angle, dataSize, duration, length, mass, power, speed, temperature, type LengthUnit } from 'quanto/codecs';
import { convert } from 'quanto/quantity';
import { feetInches, hoursMinutes } from 'quanto/formats';
import { money, moneyRange } from 'quanto/money';
import { date, dateRange, dateTime, time } from '@quantojs/datetime';
import { pitch, type PitchUnit } from '@quantojs/music';
import { de, es, fr, it, nl, pt } from '@quantojs/datetime/names';
import { useQuanto, useQuantoCtx, type Display, type QuantoField } from '@quantojs/react';
import { musicKeys } from '../catalog';
import { DatePicker } from './pickers';
import { setText, still, stop, type, wait } from './typist';

export const names = [de, es, fr, it, nl, pt];


/**
 * Example chips for the field with the given id. A chip fills the field and focuses it, and leaves the
 * commit to the person: nothing is stored until they press Enter or leave. Ones that produce an issue
 * are dimmed: a sync codec says which, and for an external one (parsing would call its service) `bad`
 * lists them.
 */
export function Try(props: { field: string; codec?: Codec<any>; bad?: readonly string[]; texts: readonly string[]; onRun?: () => void }) {
  const { field, codec, bad = [], texts, onRun } = props;
  const ctx = useQuantoCtx();
  const run = (text: string) => {
    const input = document.getElementById(field);
    if (!(input instanceof HTMLInputElement)) return;
    onRun?.();
    stop(input);
    input.focus();
    setText(input, text);
    input.setSelectionRange(text.length, text.length);
  };
  return (
    <span className="chips">
      <span className="overline">try</span>
      {texts.map((text) => {
        const ok = codec ? codec.parse(text, ctx).ok : !bad.includes(text);
        return (
          <button type="button" key={text} className={ok ? 'chip' : 'chip bad'} title={ok ? undefined : 'produces an issue'} onClick={() => run(text)}>
            {text}
          </button>
        );
      })}
    </span>
  );
}

// Single values, a range of most, and all of it optionally approximate. Wrappers compose from the
// outside in: approx reads the marker, merge picks the reading, and each range completes its own two
// sides. Money goes after length because it reads `ft` as the forint. Speed, power, data size and
// angle are there for the fun of `88 mph`, `1.21 GW`, `1.5 GB` and `π rad`, and pitch for `A4 +15¢`.
// Time signatures stay out: `6/8` is a date.
const plainLength = length();
/**
 * The built-in length format, with two twists for the demo: feet and inches read as 5'11", and Planck
 * lengths, which no one has a feel for, become light-years, spelled out (10¹⁰⁰ ℓₚ is 1.708×10⁴⁹
 * light-years). `light-year` and `light-years` are aliases, so the text still reads back.
 */
const lengthFormat = (value: Quantity<LengthUnit>, ctx: ResolvedCtx): string => {
  if (value.unit === 'ft' || value.unit === 'in') return feetInches(value, ctx);
  if (value.unit !== 'planck') return plainLength.format(value, { locale: ctx.locale.tag });
  const years = convert(plainLength, value, 'ly');
  return plainLength.format(years, { locale: ctx.locale.tag }).replace(/ ly$/, years.value === 1 ? ' light-year' : ' light-years');
};
const plainPitch = pitch();
/**
 * Pitch, the other way round. A note shows as its frequency (`A#`, octave 4 when none is written, is
 * 466.16 Hz). A frequency shows as just its nearest note, spelled for the key picked beside the field
 * (`ctx.music.key`), with no octave and its cents only as the way they lean (`440 Hz` is A, `455 Hz` is
 * A♯-, or B♭- in F major), so that text doesn't read back on its own.
 */
const pitchFormat = (value: Quantity<PitchUnit>, ctx: ResolvedCtx): string => {
  const plain = { locale: ctx.locale.tag, music: ctx.music };
  if (value.unit === 'note') return plainPitch.format(convert(plainPitch, value, 'Hz'), plain);
  return plainPitch
    .format(convert(plainPitch, value, 'note'), plain)
    .replace(/-?\d+(?=\s|$)/, '')
    .replace(/ ([+-])[\d.,]+¢$/, '$1');
};
const singles = {
  date: date({ names }),
  time: time(),
  dateTime: dateTime({ names }),
  length: length({ format: lengthFormat }),
  mass: mass(),
  duration: duration({ format: hoursMinutes }),
  temperature: temperature(),
  money: money(),
  speed: speed(),
  power: power(),
  dataSize: dataSize(),
  angle: angle(),
  pitch: pitch({ format: pitchFormat, defaultOctave: 4 }),
};
const merged = approx(
  merge([
    ...Object.values(singles),
    dateRange(singles.date),
    dateRange(singles.time),
    dateRange(singles.dateTime),
    range(singles.length),
    range(singles.mass),
    range(singles.duration),
    range(singles.temperature),
    moneyRange(singles.money),
    defineRange(singles.pitch),
  ]),
);

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
/**
 * quanto prints huge numbers as powers of ten (`1.708×10⁴⁹`, `10¹⁰⁰`); the demo prefers e notation
 * (`1.708e49`, `1e100`), which reads back just the same.
 */
const eNotation = (text: string): string =>
  text.replace(/(?:(\d+(?:[.,]\d+)?)×)?10(⁻?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_, factor: string | undefined, power: string) =>
    `${factor ?? '1'}e${[...power].map((c) => (c === '⁻' ? '-' : SUPERSCRIPT_DIGITS.indexOf(c))).join('')}`,
  );
const anything: typeof merged = { ...merged, format: (value, ctx) => eNotation(merged.format(value, ctx)) };
export const heroExamples = ['next fri', '$1.2k', '180 cm', 'October 3 to 5', 'about 6 ft', '9-5pm', '$10-20k', '~2-3h', '€12,50', '455hz', '2. Oktober'];

type Anything = typeof anything extends Codec<infer T> ? T : never;

/**
 * The one issue worth showing. A merge reports every member's, and most only say the text wasn't theirs
 * (no unit they know, no currency), which misleads when another codec was meant. An issue from a codec
 * that did read the text is the real one.
 */
function problem(issues: readonly Issue[]): string | undefined {
  if (issues.length === 0) return undefined;
  const real = issues.find((issue) => issue.code === 'empty' || issue.code === 'excess_precision' || issue.code === 'invalid');
  return real?.message ?? 'No codec could read that.';
}

/** A value as a one-line JS literal, coloured by token. */
export function Code({ value }: { value: unknown }): ReactNode {
  const p = (text: string) => <span className="j-p">{text}</span>;
  if (Array.isArray(value)) {
    return (
      <>
        {p('[')}
        {value.map((x, i) => (
          <Fragment key={i}>
            {i > 0 && p(', ')}
            <Code value={x} />
          </Fragment>
        ))}
        {p(']')}
      </>
    );
  }
  if (value !== null && typeof value === 'object') {
    return (
      <>
        {p('{ ')}
        {Object.entries(value)
          .filter(([, x]) => x !== undefined)
          .map(([k, x], i) => (
            <Fragment key={k}>
              {i > 0 && p(', ')}
              <span className="j-k">{k}</span>
              {p(': ')}
              <Code value={x} />
            </Fragment>
          ))}
        {p(' }')}
      </>
    );
  }
  return <span className={typeof value === 'string' ? 'j-s' : typeof value === 'number' ? 'j-n' : 'j-b'}>{JSON.stringify(value)}</span>;
}

const github = 'https://github.com/endograph/quanto';
/** Where each codec in the big field lives in the repo, by the id `merge` tags its values with. */
const sources: Readonly<Record<string, string>> = {
  date: 'tree/main/packages/datetime/src/date',
  time: 'tree/main/packages/datetime/src/time',
  dateTime: 'tree/main/packages/datetime/src/date-time',
  length: 'tree/main/packages/quanto/src/codecs/length',
  mass: 'tree/main/packages/quanto/src/codecs/mass',
  duration: 'tree/main/packages/quanto/src/codecs/duration',
  temperature: 'tree/main/packages/quanto/src/codecs/temperature',
  money: 'tree/main/packages/quanto/src/money',
  speed: 'tree/main/packages/quanto/src/codecs/speed',
  power: 'tree/main/packages/quanto/src/codecs/power',
  dataSize: 'tree/main/packages/quanto/src/codecs/data-size',
  angle: 'tree/main/packages/quanto/src/codecs/angle',
  pitch: 'tree/main/packages/music/src/pitch',
  'range(date)': 'blob/main/packages/datetime/src/range.ts',
  'range(time)': 'blob/main/packages/datetime/src/range.ts',
  'range(dateTime)': 'blob/main/packages/datetime/src/range.ts',
  'range(money)': 'blob/main/packages/quanto/src/money/range.ts',
};

/** The codec's id, as a link to its source. Quantity ranges all come from the core's `range`. */
function CodecLink({ id }: { id: string }) {
  return (
    <a className="codec" href={`${github}/${sources[id] ?? 'tree/main/packages/quanto/src/range'}`} target="_blank" rel="noreferrer">
      {id}
    </a>
  );
}

/**
 * What the field makes of its text, a row per part. It follows the text as soon as it parses, and keeps
 * the last reading while it doesn't. An error waits for the commit, like the field's own.
 */
function Status({ field }: { field: QuantoField<Anything> }) {
  const last = useRef<(readonly [string, ReactNode])[]>([]);
  const { echo, value: committed } = field;
  const error = problem(field.issues);
  if (error) {
    last.current = [['raw', <Code value={committed?.raw ?? ''} />], ['error', <span className="bad">{error}</span>]];
  } else if (echo) {
    // Unedited text echoes the committed value, whose raw is what was typed, not the formatted text on show.
    const settled = committed && 'value' in committed && committed.value === echo.value;
    last.current = [
      ['raw', <Code value={settled ? committed.raw : field.inputProps.value} />],
      ['codec', <CodecLink id={echo.value.value.codec} />],
      ['value', <Code value={echo.value.value.value} />],
      ['approximate', <Code value={echo.value.approximate} />],
    ];
  }
  const rows = last.current;
  return (
    <div className="status">
      <p className="overline">status</p>
      {rows.length === 0 ? (
        <p className="idle">Nothing yet. This follows the text as soon as it parses.</p>
      ) : (
        <dl>
          {rows.map(([name, shown]) => (
            <Fragment key={name}>
              <dt>{name}</dt>
              <dd>{shown}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * The value, or for `ms` after it goes away, the last one it had. A new value shows at once; only its
 * going waits, so text that stops parsing for a keystroke on its way to parsing again doesn't flicker.
 */
function useLinger<T>(value: T | undefined, ms: number): T | undefined {
  const [last, setLast] = useState(value);
  useEffect(() => {
    if (value !== undefined) {
      setLast(value);
      return;
    }
    const timer = setTimeout(() => setLast(undefined), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return value ?? last;
}

/** Lets the page move the field on to its next example, which also restarts its typing. */
export interface OmniHandle {
  next(): void;
}

export function Omni(props: {
  display?: Display;
  restoreOnEdit?: boolean;
  /** What it types and offers as chips. */
  examples?: readonly string[];
  /** Labels over the field and its reading, when the reading sits beside it. */
  labels?: readonly [field: string, reading: string];
  handle?: Ref<OmniHandle>;
  onExample?: () => void;
}) {
  const { display = 'raw', restoreOnEdit = false, examples = heroExamples, labels, handle, onExample } = props;
  // The key the pitch tool picks. It's ctx, not part of the value: it only changes how notes are spelled.
  const [key, setKey] = useState('');
  const providerCtx = useQuantoCtx();
  const field = useQuanto(anything, { display, restoreOnEdit, ctx: key ? { ...providerCtx, music: { key } } : providerCtx });
  const ref = useRef<HTMLInputElement>(null);
  // The field types its own examples until someone takes it over. `skip` restarts it on the next one.
  const [auto, setAuto] = useState(true);
  const [skip, setSkip] = useState(0);
  const example = useRef(0);
  const advance = () => {
    example.current = (example.current + 1) % examples.length;
    onExample?.();
  };
  useImperativeHandle(handle, () => ({
    next() {
      advance();
      setAuto(true);
      setSkip((s) => s + 1);
    },
  }));
  useEffect(() => {
    const input = ref.current;
    if (!auto || !input) return;
    let on = true;
    void (async () => {
      while (on && (await type(input, examples[example.current]!))) {
        if (still) return;
        await wait(4500);
        if (!on) return;
        advance();
      }
    })();
    return () => {
      on = false;
      stop(input);
    };
  }, [auto, skip]);
  // Reaching for a tool stops the typing, and keeps the text it's for.
  const hold = () => {
    if (!auto || !ref.current) return;
    setAuto(false);
    stop(ref.current);
  };
  const takeOver = (how: 'pointer' | 'key') => {
    const input = ref.current;
    if (!auto || !input) return;
    setAuto(false);
    stop(input);
    // Their typing replaces the example either way.
    if (how === 'key') input.select();
    else setText(input, '');
  };
  // A raw field keeps the typed text, so its reading sits beside it. A formatted one becomes the reading
  // on blur, so until then the reading waits inside the field.
  const beside = display === 'raw';
  const labelled = beside && labels !== undefined;
  const error = problem(field.issues);
  const echo = error ? undefined : field.echo;
  const ghost = echo && echo.text !== field.inputProps.value.trim() ? echo.text : undefined;
  // Once the text reads as a date or a pitch, a tool for it sits in the field: the OS's date picker, or
  // the key that spells the notes.
  const current = echo?.value;
  const tool = current?.value.codec === 'date' ? 'date' : current?.value.codec === 'pitch' ? 'pitch' : undefined;
  // Beside the field, the reading holds on briefly when the text stops parsing. An issue replaces it at once.
  const lingering = useLinger(echo?.text, 150);
  const reading = error ? undefined : lingering;
  // Under a labelled reading, the value it stands for, as plain JSON: what the app is handed.
  const lingeringJson = useLinger(echo && JSON.stringify(echo.value.value.value), 150);
  const json = error ? undefined : lingeringJson;
  // The reading and an issue share one place: whichever the field has to say about the text.
  const said = (
    <>
      <span id={field.ids.echo}>{beside ? reading : ghost}</span>
      <span id={field.ids.issues} role="alert">
        {error}
      </span>
    </>
  );
  return (
    <>
      <div className={labelled ? 'hero-field beside labelled' : beside ? 'hero-field beside' : 'hero-field'}>
        {labelled && (
          <label className="overline input-label" htmlFor="hero">
            {labels[0]}
          </label>
        )}
        {labelled && <p className="overline reading-label">{labels[1]}</p>}
        <span className="hero-input" data-tool={tool}>
          <input
            {...field.inputProps}
            ref={ref}
            id="hero"
            className="text-field"
            aria-label="Type a date, a time, an amount or a measurement, or a range of them"
            placeholder="next fri, $10-20k, about 6 ft…"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onPointerDown={() => takeOver('pointer')}
            onKeyDown={(e) => {
              if (e.nativeEvent.isTrusted) takeOver('key');
              field.inputProps.onKeyDown(e);
            }}
          />
          {!beside && <span className={error ? 'ghost bad' : 'ghost'}>{said}</span>}
          {tool && (
            <span className="hero-tool" onPointerDown={hold}>
              {current && tool === 'date' ? (
                <DatePicker
                  value={current.value.value as string}
                  onChange={(iso) => field.pick({ ...current, value: { codec: 'date', value: iso } } as Anything)}
                  focused={field.focused}
                />
              ) : (
                <label className="key-tool">
                  <span aria-hidden="true">♪</span>
                  <select value={key} aria-label="Key, for spelling notes (ctx.music.key)" onChange={(e) => setKey(e.target.value)}>
                    <option value="">no key</option>
                    {musicKeys.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
              )}
            </span>
          )}
        </span>
        {beside && !labelled && <p className={error ? 'reading bad' : 'reading'}>{said}</p>}
        {labelled && (
          <div className="reading-cell">
            <p className={error ? 'reading bad' : 'reading'}>{said}</p>
            <p className="reading-json" aria-hidden="true">
              {json}
            </p>
          </div>
        )}
      </div>
      <Try field="hero" codec={anything} texts={examples} onRun={() => setAuto(false)} />
      <Status field={field} />
    </>
  );
}
