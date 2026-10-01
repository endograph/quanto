// The demo page: one big field to try, with switches for how it behaves, then recommended UI patterns
// for quanto fields, built with quanto-react. Every field is real, and demonstrates itself: the big one
// types its own examples, each card's chips fill its field, and the onChange strip shows exactly what
// the app is handed.
import { createContext, Fragment, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import * as z from 'zod/mini';
import { defineExternalCodec, merge, type Issue, type Quantity, type QuantoValue, type Tagged } from 'quanto';
import { duration, length, mass, type DurationUnit, type LengthUnit, type MassUnit } from 'quanto/codecs';
import { money } from 'quanto/money';
import { compare } from 'quanto/quantity';
import { date, dateRange } from 'quanto-datetime';
import { QuantoInput, QuantoProvider, useQuanto, type Display } from 'quanto-react';
import { locales } from './codecs';
import { model, readDuration, vaguePhrases } from './demo/model';
import { DatePicker } from './demo/pickers';
import { names, Omni, Try } from './demo/omni';
import { type } from './demo/typist';
import { glyphs } from './glyphs';

/** The switches under "Try it out", applied to every field on the page. */
interface Config {
  readonly display: Display;
  readonly restoreOnEdit: boolean;
}
const ConfigContext = createContext<Config>({ display: 'raw', restoreOnEdit: false });
const useConfig = () => useContext(ConfigContext);

// ── Shared bits ──────────────────────────────────────────────────────────

/** A value as a one-line JS literal, the way it would look in code. */
function literal(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(literal).join(', ')}]`;
  if (v !== null && typeof v === 'object') {
    const fields = Object.entries(v).filter(([, x]) => x !== undefined);
    return `{ ${fields.map(([k, x]) => `${k}: ${literal(x)}`).join(', ')} }`;
  }
  return JSON.stringify(v);
}

/** What onChange last handed the app. It flashes when a new envelope arrives. */
function Stored({ value }: { value: unknown }) {
  const text = value === undefined ? undefined : literal(value);
  return (
    <p className="stored">
      <span className="overline">onChange</span>
      {text === undefined ? <span className="idle">fires on blur, Enter or a pick</span> : <code className="flash" key={text}>{text}</code>}
    </p>
  );
}

function Card(props: { title: string; why: ReactNode; code: string; stored?: unknown; wide?: boolean; children: ReactNode }) {
  return (
    <section className={props.wide ? 'card wide' : 'card'}>
      <h3>{props.title}</h3>
      <p className="why">{props.why}</p>
      {props.children}
      {'stored' in props && <Stored value={props.stored} />}
      <details>
        <summary>code</summary>
        <pre>{props.code.trim()}</pre>
      </details>
    </section>
  );
}

/** Keeps the last envelope a field emitted, for the card's onChange strip. */
function useStored<T>() {
  const [stored, setStored] = useState<QuantoValue<T>>();
  return [stored, (value: QuantoValue<T>) => setStored(value)] as const;
}

// ── Try it out ──────────────────────────────────────────────────────────

function Hero({ controls }: { controls: ReactNode }) {
  const config = useConfig();
  return (
    <section className="hero grid-bg">
      <div className="hero-inner">
        <h1 className="section-title">Try it out</h1>
        {controls}
        <Omni {...config} />
      </div>
    </section>
  );
}

// ── 1. Free text with the OS picker ─────────────────────────────────────

const flexibleDate = date({ names });

function PickerCard() {
  const [stored, onChange] = useStored<string>();
  return (
    <Card
      title="Type it, or pick it"
      why={<>Free text comes first, in any language you load. The button opens the OS's own picker, and either way the app gets the same ISO date.</>}
      stored={stored}
      code={`
import { date } from 'quanto-datetime';
import { de, fr, es } from 'quanto-datetime/names';

<QuantoInput
  codec={date({ names: [de, fr, es] })}
  accessory={DatePicker}   // a button over <input type="date">
  onChange={save}
/>`}
    >
      <label className="field-label" htmlFor="when">Delivery date</label>
      <QuantoInput id="when" className="text-field" {...useConfig()} codec={flexibleDate} accessory={DatePicker} placeholder="next fri" onChange={onChange} />
      <Try field="when" codec={flexibleDate} texts={['next fri', 'Oct 2', '2. Oktober', '2 de octubre', 'someday']} />
    </Card>
  );
}

// ── 2. Kind validation ──────────────────────────────────────────────────

const len = length();
const ft = (value: number): Quantity<LengthUnit> => ({ value, unit: 'ft' });
const height = length({
  schema: z.custom<Quantity<LengthUnit>>().check(
    z.refine((h) => compare(len, h, ft(3)) >= 0, 'Shorter than 3 ft? Check the units.'),
    z.refine((h) => compare(len, h, ft(8)) <= 0, 'Taller than 8 ft? Check the units.'),
  ),
});

/** Issue copy written for this field, chosen by `code`. quanto's own messages are generic English. */
function heightMessage(issue: Issue, raw: string): string {
  switch (issue.code) {
    case 'unknown_unit':
      return mass().parse(raw).ok ? "That's a weight, not a height." : `Try 5'11" or 180 cm.`;
    case 'missing_unit':
      return `Add a unit: 71 in, 180 cm or 5'11".`;
    case 'empty':
      return 'Enter a height.';
    case 'invalid':
      return issue.message;
    default:
      return `Couldn't read that as a height. Try 5'11" or 180 cm.`;
  }
}

function HeightField({ onChange }: { onChange: (v: QuantoValue<Quantity<LengthUnit>>) => void }) {
  const field = useQuanto(height, { onChange, ...useConfig() });
  const raw = field.value?.raw ?? '';
  return (
    <span data-quanto="">
      <input {...field.inputProps} className="text-field" id="height" placeholder={`5'11" or 180 cm`} />
      <span id={field.ids.echo} data-quanto-echo="">
        {field.showEcho ? field.echo?.text : null}
      </span>
      <span id={field.ids.issues} role="alert" className="issue-list">
        {field.issues.map((issue, i) => (
          <span className="issue" key={i}>
            <span className="tag">{issue.code}</span>
            {heightMessage(issue, raw)}
          </span>
        ))}
      </span>
    </span>
  );
}

function ValidationCard() {
  const [stored, onChange] = useStored<Quantity<LengthUnit>>();
  return (
    <Card
      title="Errors that wait their turn"
      why={<>Nothing turns red while you type. Issues show once you leave the field, in copy written for it, and clear the moment the text makes sense.</>}
      stored={stored}
      code={`
const height = length({
  // any Standard Schema library: Zod Mini here
  schema: z.custom<Quantity>().check(
    z.refine((h) => compare(len, h, ft(8)) <= 0, 'Taller than 8 ft? Check the units.'),
  ),
});

const field = useQuanto(height, { onChange: save });

<input {...field.inputProps} />
{field.issues.map((issue) => (
  // write copy per issue.code; quanto's messages are generic
  <Issue code={issue.code}>{heightMessage(issue)}</Issue>
))}`}
    >
      <label className="field-label" htmlFor="height">Height</label>
      <HeightField onChange={onChange} />
      <Try field="height" codec={height} texts={[`5'11"`, '180 cm', '70 kg', '70', '9 ft']} />
    </Card>
  );
}

// ── 3. Money that tidies itself ─────────────────────────────────────────

const price = money();

function MoneyCard() {
  const [stored, onChange] = useStored<unknown>();
  return (
    <Card
      title="Money that tidies itself"
      why={<>Shorthand in, a proper amount out: leave the field and it shows the formatted value. It knows a dollar has no third decimal.</>}
      stored={stored}
      code={`
// display defaults to 'formatted-on-blur'
<QuantoInput codec={money()} onChange={save} />`}
    >
      <label className="field-label" htmlFor="price">Price</label>
      <QuantoInput id="price" className="text-field" {...useConfig()} codec={price} placeholder="$1.2k" onChange={onChange} />
      <Try field="price" codec={price} texts={['$1.2k', '€12,50', 'USD 12.99', '¥500', '$3.459']} />
    </Card>
  );
}

// ── 4. Did you mean…? ───────────────────────────────────────────────────

const either = merge([length(), duration()]);
type Either = Tagged<Quantity<LengthUnit> | Quantity<DurationUnit>>;

function EitherField({ onChange }: { onChange: (v: QuantoValue<Either>) => void }) {
  const field = useQuanto(either, { onChange, ...useConfig() });
  const committed = field.value && 'value' in field.value ? field.value.value : undefined;
  const options = field.echo ? [field.echo.value, ...field.echo.alternatives] : [];
  return (
    <span data-quanto="">
      <input {...field.inputProps} className="text-field" id="either" placeholder="1m" />
      <span id={field.ids.echo} data-quanto-echo="">
        {options.length > 1 || field.echo?.text === field.inputProps.value.trim() ? '' : field.echo?.text}
      </span>
      {options.length > 1 && (
        <span className="choices" style={{ gridColumn: '1 / -1' }}>
          <span className="label">did you mean</span>
          {options.map((o) => (
            <button
              key={o.codec}
              type="button"
              className="choice"
              aria-pressed={committed?.codec === o.codec}
              onClick={() => field.pick(o)}
            >
              {either.format(o)}
              <small>{o.codec}</small>
            </button>
          ))}
        </span>
      )}
      <span id={field.ids.issues} data-quanto-issues="" role="alert">
        {field.issues[0]?.message}
      </span>
    </span>
  );
}

function AlternativesCard() {
  const [stored, onChange] = useStored<Either>();
  return (
    <Card
      title="It asks instead of guessing"
      why={<>Some text means two things. <code>1m</code> is a metre or a minute, so the field offers both.</>}
      stored={stored}
      code={`
const either = merge([length(), duration()]);
const field = useQuanto(either, { onChange: save, display: 'raw' });
const options = field.echo ? [field.echo.value, ...field.echo.alternatives] : [];

{options.map((o) => (
  <button onClick={() => field.pick(o)}>{either.format(o)}</button>
))}`}
    >
      <label className="field-label" htmlFor="either">Length or duration</label>
      <EitherField onChange={onChange} />
      <Try field="either" codec={either} texts={['1m', '90 min', '6 ft', '1,5 h']} />
    </Card>
  );
}

// ── 5. Parsing that calls out ───────────────────────────────────────────

const durationCodec = duration();

/** An external codec: its parse is a request to a (stand-in) model; format and check are local. */
const howLong = defineExternalCodec<Quantity<DurationUnit>>({
  id: 'howLong',
  parse: (text, ctx) => readDuration(text, { locale: ctx.locale.tag, signal: ctx.signal }),
  format: (value, ctx) => durationCodec.format(value, { locale: ctx.locale.tag }),
  check: (value) => {
    const result = durationCodec.schema['~standard'].validate(value);
    return result instanceof Promise || !result.issues ? [] : result.issues.map((issue) => ({ message: issue.message }));
  },
});

function ExternalCard() {
  const [stored, onChange] = useStored<Quantity<DurationUnit>>();
  const [down, setDown] = useState(model.down);
  const toggle = (next: boolean) => {
    model.down = next;
    setDown(next);
  };
  return (
    <Card
      wide
      title="Parsing that calls out"
      why={<>An external codec sends the text to a service: here, a stand-in for a language model that reads vague phrases. It parses only when you commit, shows that it's waiting, and if the service is down it keeps your text and stores nothing.</>}
      stored={stored}
      code={`
const howLong = defineExternalCodec({
  id: 'howLong',
  // resolves with issues for nonsense; rejects if the model is down
  parse: (text, ctx) => model.read(text, { signal: ctx.signal }),
  format: (value, ctx) => duration().format(value, ctx),  // format stays local and sync
  check,
});

<QuantoInput
  codec={howLong}
  onChange={save}
  failedMessage="The model is unavailable. Press Enter to try again."
/>`}
    >
      <label className="field-label" htmlFor="how-long">How long will it take?</label>
      <div className="external">
        <QuantoInput
          id="how-long"
          className="text-field"
          {...useConfig()}
          codec={howLong}
          placeholder="a couple of hours"
          failedMessage="The model is unavailable. Press Enter to try again."
          onChange={onChange}
        />
      </div>
      <Try field="how-long" bad={['soonish']} texts={[vaguePhrases[0]!, 'a fortnight', 'all afternoon', '90 min', 'soonish']} />
      <label className="switch outage">
        <input type="checkbox" checked={down} onChange={(e) => toggle(e.target.checked)} />
        <span className="track" />
        <span>
          the model is down <small>parse rejects</small>
        </span>
      </label>
    </Card>
  );
}

// ── 6. A whole form ─────────────────────────────────────────────────────

const tripDates = dateRange(date({ names }));
const budget = money();
const kg = (value: number): Quantity<MassUnit> => ({ value, unit: 'kg' });
const massTable = mass();
const bag = mass({
  schema: z.custom<Quantity<MassUnit>>().check(z.refine((m) => compare(massTable, m, kg(23)) <= 0, 'Checked bags max out at 23 kg (50 lb).')),
});

function TripCard() {
  const config = useConfig();
  const envelopes = useRef<Record<string, QuantoValue<unknown>>>({});
  const [submitted, setSubmitted] = useState<Record<string, QuantoValue<unknown>>>();
  const keep = (key: string) => (value: QuantoValue<any>) => {
    envelopes.current = { ...envelopes.current, [key]: value };
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(envelopes.current);
  };
  const fill = async () => {
    for (const [id, text] of [['dates', 'Oct 3-5'], ['budget', '$1.2k'], ['bag', '40 lb']] as const) {
      const input = document.getElementById(id);
      if (!(input instanceof HTMLInputElement) || !(await type(input, text))) return;
    }
  };
  return (
    <Card
      wide
      title="A whole form"
      why={<>Each field commits on blur or Enter, and Enter still submits the form. What the app gets is one <code>{'{ raw, value }'}</code> per field: store it as is, and validate <code>value</code> on the server with <code>codec.schema</code>.</>}
      code={`
<form onSubmit={submit}>
  <QuantoInput codec={dateRange(date())} onChange={(v) => (form.dates = v)} />
  <QuantoInput codec={money()} onChange={(v) => (form.budget = v)} />
  <QuantoInput codec={mass({ schema: max23kg })} onChange={(v) => (form.bag = v)} />
  <button>Plan it</button>
</form>`}
    >
      <form className="form" onSubmit={submit}>
        <div>
          <label className="field-label" htmlFor="dates">Dates</label>
          <QuantoInput id="dates" className="text-field" {...config} codec={tripDates} placeholder="Oct 3-5" onChange={keep('dates')} />
        </div>
        <div>
          <label className="field-label" htmlFor="budget">Budget</label>
          <QuantoInput id="budget" className="text-field" {...config} codec={budget} placeholder="$800" onChange={keep('budget')} />
        </div>
        <div>
          <label className="field-label" htmlFor="bag">Checked bag</label>
          <QuantoInput id="bag" className="text-field" {...config} codec={bag} placeholder="40 lb" onChange={keep('bag')} />
        </div>
        <div className="actions">
          <button className="btn" type="submit">Plan it <span aria-hidden="true">→</span></button>
          <button className="chip" type="button" onClick={fill}>fill it in for me</button>
        </div>
      </form>
      {submitted && (
        <div className="submitted">
          <p className="overline">what the app stores</p>
          <pre className="flash" key={JSON.stringify(submitted)}>{JSON.stringify(submitted, null, 2)}</pre>
        </div>
      )}
    </Card>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

/** The mark, as on the landing page: a click presses it into its shadow and swaps in the next glyph. */
function Mark() {
  const [glyph, setGlyph] = useState(0);
  const [pressed, setPressed] = useState(false);
  const cycle = () => {
    setPressed(true);
    setTimeout(() => {
      setGlyph((g) => (g + 1) % glyphs.length);
      setPressed(false);
    }, 110);
  };
  return (
    <button className="mark-button" type="button" aria-label="quanto mark. Click to change the glyph." onClick={cycle}>
      <svg className={pressed ? 'mark pressed' : 'mark'} viewBox="10 4 44 58" aria-hidden="true">
        <path className="shade" d={glyphs[glyph]} />
        <path className="face" d={glyphs[glyph]} />
      </svg>
    </button>
  );
}

function Page() {
  const [locale, setLocale] = useState(() => new URLSearchParams(location.search).get('locale') ?? 'en-US');
  const choose = (next: string) => {
    setLocale(next);
    const url = new URL(location.href);
    if (next === 'en-US') url.searchParams.delete('locale');
    else url.searchParams.set('locale', next);
    history.replaceState(null, '', url);
  };
  const [formatOnBlur, setFormatOnBlur] = useState(false);
  const [restoreOnEdit, setRestoreOnEdit] = useState(false);
  const config: Config = { display: formatOnBlur ? 'formatted-on-blur' : 'raw', restoreOnEdit };
  const controls = (
    <div className="config" role="toolbar" aria-label="Field behaviour">
      <label className="switch">
        <input type="checkbox" checked={formatOnBlur} onChange={(e) => setFormatOnBlur(e.target.checked)} />
        <span className="track" />
        <span>
          format on blur <small>display="{config.display}"</small>
        </span>
      </label>
      <label className="switch" title={formatOnBlur ? undefined : 'Only a formatted field has something to restore.'}>
        <input type="checkbox" disabled={!formatOnBlur} checked={formatOnBlur && restoreOnEdit} onChange={(e) => setRestoreOnEdit(e.target.checked)} />
        <span className="track" />
        <span>
          restore original on edit <small>restoreOnEdit</small>
        </span>
      </label>
    </div>
  );
  return (
    <QuantoProvider ctx={{ locale }}>
      <ConfigContext.Provider value={config}>
        <header>
          <div className="brand">
            <Mark />
            <a href="../index.html">quanto</a>
          </div>
          <nav className="views" aria-label="Playground">
            <a href="./index.html" aria-current="page">demo</a>
            <a href="../play/index.html">codecs</a>
          </nav>
          <label className="ctx">
            <span className="label">ctx.locale</span>
            <select value={locale} onChange={(e) => choose(e.target.value)}>
              {locales.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </header>
        <Fragment key={locale}>
          <Hero controls={controls} />
          <main>
            <h2 className="section-title">Examples</h2>
            <div className="cards">
              <PickerCard />
              <MoneyCard />
              <ValidationCard />
              <AlternativesCard />
              <ExternalCard />
              <TripCard />
            </div>
          </main>
        </Fragment>
        <footer>
          <span>Every field here is the real quanto-react. Pre-release.</span>
          <span>Unstyled by default; this page styles the data-quanto hooks.</span>
        </footer>
      </ConfigContext.Provider>
    </QuantoProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Page />);
