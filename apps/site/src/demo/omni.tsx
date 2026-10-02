// The big field that reads anything: it types its own examples until someone takes it over, offers
// them as chips, and shows what it makes of the text. The landing page shows it as it comes; the
// playground gives it the codec picked there, and its own inspector in place of the status.
import { Fragment, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { formatNumber, type Codec, type Issue, type Quantity, type ResolvedCtx } from 'quanto';
import { convert } from 'quanto/quantity';
import { length, type LengthUnit } from '@quantojs/common';
import { feetInches, hoursMinutes } from '@quantojs/common/formats';
import { anything, type AnythingValue } from '@quantojs/anything';
import type { Coordinates } from '@quantojs/geo';
import { pitch, type PitchUnit } from '@quantojs/music';
import { de, es, fr, it, nl, pt } from '@quantojs/datetime/names';
import { useQuanto, useQuantoCtx, type Display, type QuantoField } from '@quantojs/react';
import { musicKeys } from '../choices';
import { DatePicker } from './pickers';
import { setText, still, stop, type, wait } from './typist';

const names = [de, es, fr, it, nl, pt];


/**
 * Example chips for the field with the given id. A chip fills the field and focuses it, and leaves the
 * commit to the person: nothing is stored until they press Enter or leave. Ones that produce an issue
 * are dimmed.
 */
function Try(props: { field: string; codec: Codec<any>; texts: readonly string[]; onRun: () => void }) {
  const { field, codec, texts, onRun } = props;
  const ctx = useQuantoCtx();
  const run = (text: string) => {
    const input = document.getElementById(field);
    if (!(input instanceof HTMLInputElement)) return;
    onRun();
    stop(input);
    input.focus();
    setText(input, text);
    input.setSelectionRange(text.length, text.length);
  };
  return (
    <span className="chips">
      <span className="overline">try</span>
      {texts.map((text) => {
        const ok = codec.parse(text, ctx).ok;
        return (
          <button type="button" key={text} className={ok ? 'chip' : 'chip bad'} title={ok ? undefined : 'produces an issue'} onClick={() => run(text)}>
            {text}
          </button>
        );
      })}
    </span>
  );
}

// The field reads with `@quantojs/anything`, whose order settles every conflict (`24 × 36 in` is
// dimensions, `455hz` a pitch, `70` a number), with a few formats of the site's own.
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
 * Pitch, the other way round. A note shows as its frequency (`A#4` is 466.16 Hz). A frequency shows as
 * just its nearest note, spelled for the key picked beside the field (`ctx.music.key`), with no octave
 * and its cents only as the way they lean (`440 Hz` is A, `455 Hz` is A♯-, or B♭- in F major), so that
 * text doesn't read back on its own.
 */
const pitchFormat = (value: Quantity<PitchUnit>, ctx: ResolvedCtx): string => {
  const plain = { locale: ctx.locale.tag, music: ctx.music };
  if (value.unit === 'note') return plainPitch.format(convert(plainPitch, value, 'Hz'), plain);
  return plainPitch
    .format(convert(plainPitch, value, 'note'), plain)
    .replace(/-?\d+(?=\s|$)/, '')
    .replace(/ ([+-])[\d.,]+¢$/, '$1');
};
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
/**
 * quanto prints huge numbers as powers of ten (`1.708×10⁴⁹`, `10¹⁰⁰`); the demo prefers e notation
 * (`1.708e49`, `1e100`), which reads back just the same.
 */
const eNotation = (text: string): string =>
  text.replace(/(?:(\d+(?:[.,]\d+)?)×)?10(⁻?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_, factor: string | undefined, power: string) =>
    `${factor ?? '1'}e${[...power].map((c) => (c === '⁻' ? '-' : SUPERSCRIPT_DIGITS.indexOf(c))).join('')}`,
  );

/** The site's formats, by the codec that read the value; the rest print as `anything` prints them. */
/**
 * Coordinates to 3 decimal places (about 100 m), so a pair fits on one line: `40.713° N, 74.006° W`.
 * The package's default keeps 6 (about 0.1 m), since its text becomes the field's when it's edited.
 */
const coordinatesFormat = ({ lat, lng }: Coordinates, ctx: ResolvedCtx): string => {
  const part = (value: number, positive: string, negative: string): string => {
    const text = formatNumber(Math.abs(value), ctx, { maxFractionDigits: 3 });
    return `${text}° ${value >= 0 || text === '0' ? positive : negative}`;
  };
  return `${part(lat, 'N', 'S')}, ${part(lng, 'E', 'W')}`;
};

const formats: Readonly<Record<string, (value: never, ctx: ResolvedCtx) => string>> = {
  length: lengthFormat,
  coordinates: coordinatesFormat,
  duration: hoursMinutes,
  pitch: pitchFormat,
};

const make = (include: Codec<unknown>[]): Codec<AnythingValue> => {
  const plain = anything({ names, include });
  return anything({
    names,
    include,
    format: (value, ctx) => {
      const own = formats[value.value.codec];
      return eNotation(own ? `${value.approximate ? '~' : ''}${own(value.value.value as never, ctx)}` : plain.format(value, { locale: ctx.locale.tag, music: ctx.music }));
    },
  });
};

/**
 * Phone numbers bring libphonenumber-js's metadata (about 80 kB), so they load on their own, after the
 * page, and the field's codec is rebuilt with them when they arrive. Started at once, so they're usually
 * there by the first keystroke.
 */
const withoutPhone = make([]);
const withPhone: Promise<Codec<AnythingValue>> = import('@quantojs/anything/phone').then(({ phoneNumber }) => make([phoneNumber()]));
const heroExamples = ['next fri', '$1.2k', '180 cm', 'October 3 to 5', '24×36in', 'about 6 ft', '9-5pm', '(415) 555-2671', '$10-20k', '~2-3h', `40°42'46"N 74°0'22"W`, '€12,50', '455hz', '2. Oktober'];

/**
 * The one issue worth showing. A merge reports every member's, and most only say the text wasn't theirs
 * (no unit they know, no currency), which misleads when another codec was meant. An issue from a codec
 * that did read the text is the real one. A single codec's first issue is its own.
 */
function problem(issues: readonly Issue[], merged: boolean): string | undefined {
  if (issues.length === 0) return undefined;
  if (!merged) return issues[0]!.message;
  const real = issues.find((issue) => issue.code === 'empty' || issue.code === 'excess_precision' || issue.code === 'invalid');
  return real?.message ?? 'No codec could read that.';
}

/** A value, as the codec that read it: `anything` tags it with that codec, inside `approx`. */
interface Reading {
  readonly codec: string;
  readonly value: unknown;
  readonly approximate?: boolean;
  /** The field's value for another value read by the same codec, for a tool to pick. */
  rewrap(value: unknown): unknown;
}

function readingOf(codec: Codec<any>, value: any): Reading {
  if (codec.id !== 'anything') return { codec: codec.id, value, rewrap: (v) => v };
  const { approximate, value: tagged } = value as AnythingValue;
  return { codec: tagged.codec, value: tagged.value, approximate, rewrap: (v) => ({ ...value, value: { codec: tagged.codec, value: v } }) };
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
  money: 'tree/main/packages/common/src/money',
  odds: 'tree/main/packages/common/src/odds',
  dimensions: 'tree/main/packages/quanto/src/dimensions',
  pitch: 'tree/main/packages/music/src/pitch',
  coordinates: 'tree/main/packages/geo/src/coordinates',
  ringSize: 'tree/main/packages/sizes/src/ring-size',
  shoeSize: 'tree/main/packages/sizes/src/shoe-size',
  phoneNumber: 'tree/main/packages/libphonenumber/src/phone-number',
  'range(date)': 'blob/main/packages/datetime/src/range.ts',
  'range(time)': 'blob/main/packages/datetime/src/range.ts',
  'range(dateTime)': 'blob/main/packages/datetime/src/range.ts',
  'range(money)': 'blob/main/packages/common/src/money/range.ts',
};

/** The rest are @quantojs/common's codecs, in a folder named for the id (`flowRate` in `flow-rate`), and the core's ranges. */
const sourceOf = (id: string): string =>
  sources[id] ??
  (id.startsWith('range(') ? 'tree/main/packages/quanto/src/range' : `tree/main/packages/common/src/${id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);

/** The codec's id, as a link to its source. Quantity ranges all come from the core's `range`. */
function CodecLink({ id }: { id: string }) {
  return (
    <a className="codec" href={`${github}/${sourceOf(id)}`} target="_blank" rel="noreferrer">
      {id}
    </a>
  );
}

/**
 * What the field makes of its text, a row per part. It follows the text as soon as it parses, and keeps
 * the last reading while it doesn't. An error waits for the commit, like the field's own.
 */
function Status({ field, codec }: { field: QuantoField<any>; codec: Codec<any> }) {
  const last = useRef<(readonly [string, ReactNode])[]>([]);
  const { echo, value: committed } = field;
  const error = problem(field.issues, codec.id === 'anything');
  if (error) {
    last.current = [['raw', <Code value={committed?.raw ?? ''} />], ['error', <span className="bad">{error}</span>]];
  } else if (echo) {
    // Unedited text echoes the committed value, whose raw is what was typed, not the formatted text on show.
    const settled = committed && 'value' in committed && committed.value === echo.value;
    const read = readingOf(codec, echo.value);
    last.current = [
      ['raw', <Code value={settled ? committed.raw : field.inputProps.value} />],
      ['codec', <CodecLink id={read.codec} />],
      ['value', <Code value={read.value} />],
      ...(read.approximate === undefined ? [] : [['approximate', <Code value={read.approximate} />] as const]),
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
 * A change of `reset` drops the last one at once.
 */
function useLinger<T>(value: T | undefined, ms: number, reset?: unknown): T | undefined {
  const [last, setLast] = useState(value);
  const [epoch, setEpoch] = useState(reset);
  if (reset !== epoch) {
    setEpoch(reset);
    setLast(value);
  }
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
  /** What it reads with. By default, `anything` with the site's own formats. */
  codec?: Codec<any>;
  /** Text to start with, instead of typing the examples. */
  initial?: string | undefined;
  /**
   * Shown under the field in place of the status, given its text, whether it's showing its examples, and
   * whether it's in the middle of typing one.
   */
  inspect?: (text: string, auto: boolean, typing: boolean) => ReactNode;
  display?: Display;
  restoreOnEdit?: boolean;
  /** What it types and offers as chips. */
  examples?: readonly string[];
  /** Labels over the field and its reading, when the reading sits beside it. */
  labels?: readonly [field: string, reading: string];
  handle?: Ref<OmniHandle>;
  onExample?: () => void;
}) {
  const { display = 'raw', restoreOnEdit = false, examples = heroExamples, labels, handle, onExample, initial, inspect } = props;
  // The key the pitch tool picks. It's ctx, not part of the value: it only changes how notes are spelled.
  const [key, setKey] = useState('');
  const providerCtx = useQuantoCtx();
  const [site, setSite] = useState(() => withoutPhone);
  useEffect(() => void withPhone.then((codec) => setSite(() => codec)), []);
  const codec = props.codec ?? site;
  const field = useQuanto(codec, { display, restoreOnEdit, ctx: key ? { ...providerCtx, music: { key } } : providerCtx });
  const ref = useRef<HTMLInputElement>(null);
  // The field types its own examples until someone takes it over. `skip` restarts it on the next one.
  const [auto, setAuto] = useState(initial === undefined);
  // Mid-example: from clearing the field to committing the text. A field that types its examples
  // starts out about to.
  const [typing, setTyping] = useState(initial === undefined);
  useEffect(() => {
    if (initial !== undefined && ref.current) setText(ref.current, initial);
  }, []);
  const [skip, setSkip] = useState(0);
  const example = useRef(0);
  // How long the field stays empty between examples, before the first character.
  const BLANK = 300;
  // After `next`, when the first character is due (BLANK after the click, however long React takes to
  // get to the typing), once.
  const due = useRef<number | undefined>(undefined);
  const advance = () => {
    example.current = (example.current + 1) % examples.length;
    onExample?.();
  };
  useImperativeHandle(handle, () => ({
    next() {
      // The field clears at once; the typing starts a beat later.
      if (ref.current) {
        stop(ref.current);
        setText(ref.current, '');
      }
      due.current = performance.now() + BLANK;
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
      while (on) {
        const pause = due.current === undefined ? BLANK : Math.max(0, due.current - performance.now());
        due.current = undefined;
        setTyping(true);
        const typed = await type(input, examples[example.current]!, { delay: pause });
        if (on) setTyping(false);
        if (!typed) return;
        if (still) return;
        await wait(4500);
        if (!on) return;
        advance();
      }
    })();
    return () => {
      on = false;
      stop(input);
      setTyping(false);
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
  const error = problem(field.issues, codec.id === 'anything');
  const echo = error ? undefined : field.echo;
  const ghost = echo && echo.text !== field.inputProps.value.trim() ? echo.text : undefined;
  // Once the text reads as a date or a pitch, a tool for it sits in the field: the OS's date picker, or
  // the key that spells the notes.
  const current = echo && readingOf(codec, echo.value);
  const tool = current?.codec === 'date' ? 'date' : current?.codec === 'pitch' ? 'pitch' : undefined;
  // Beside the field, the reading holds on briefly when the text stops parsing. An issue replaces it at once.
  // Moving on to the next example clears it with the field, without the wait.
  const lingering = useLinger(echo?.text, 150, skip);
  const reading = error ? undefined : lingering;
  // Under a labelled reading, the value it stands for, as plain JSON: what the app is handed.
  const lingeringJson = useLinger(current && JSON.stringify(current.value), 150, skip);
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
            aria-label={props.codec ? `Text for ${codec.id} to parse` : 'Type a date, a time, an amount or a measurement, or a range of them'}
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
                  value={current.value as string}
                  onChange={(iso) => field.pick(current.rewrap(iso))}
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
      <Try field="hero" codec={codec} texts={examples} onRun={() => setAuto(false)} />
      {inspect ? inspect(field.inputProps.value, auto, auto && typing) : <Status field={field} codec={codec} />}
    </>
  );
}
