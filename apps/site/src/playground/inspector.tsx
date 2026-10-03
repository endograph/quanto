// Everything about the field's text, from the real codec: the whole parse result, the value formatted
// and read back, in other locales, by other formatters and in every unit, the other readings, and the
// code that does it in an app.
import { Fragment, type ReactNode } from 'react';
import { isInfinite, type Codec, type ParseResult, type Quantity } from 'quanto';
import { convert } from 'quanto/quantity';
import { leafById, locales, type Entry } from '../catalog';

/** A codec picked in the playground: one from the catalog, a copy edited here, or one created here. */
export interface Choice extends Entry {
  /** The catalog codec an edited one started from. */
  readonly base?: Entry;
  /** Made here, from the template. */
  readonly created?: true;
}

const str = (s: string): string => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const p = (text: string) => <span className="j-p">{text}</span>;

/** A value as a JS object literal, one line when it's short. */
function Pretty({ value, indent = '' }: { value: unknown; indent?: string }): ReactNode {
  if (value === null || typeof value !== 'object') {
    return <span className={typeof value === 'string' ? 'j-s' : typeof value === 'number' ? 'j-n' : 'j-b'}>{JSON.stringify(value)}</span>;
  }
  const inner = indent + '  ';
  if (Array.isArray(value)) {
    return (
      <>
        {p('[')}
        {'\n'}
        {value.map((x, i) => (
          <Fragment key={i}>
            {inner}
            <Pretty value={x} indent={inner} />
            {i < value.length - 1 && p(',')}
            {'\n'}
          </Fragment>
        ))}
        {indent}
        {p(']')}
      </>
    );
  }
  const fields = Object.entries(value).filter(([, x]) => x !== undefined);
  const oneLine = fields.map(([k, x]) => `${k}: ${JSON.stringify(x)}`).join(', ');
  if (fields.every(([, x]) => x === null || typeof x !== 'object') && oneLine.length < 46) {
    return (
      <>
        {p('{ ')}
        {fields.map(([k, x], i) => (
          <Fragment key={k}>
            {i > 0 && p(', ')}
            <span className="j-k">{k}</span>
            {p(': ')}
            <Pretty value={x} />
          </Fragment>
        ))}
        {p(' }')}
      </>
    );
  }
  return (
    <>
      {p('{')}
      {'\n'}
      {fields.map(([k, x], i) => (
        <Fragment key={k}>
          {inner}
          <span className="j-k">{k}</span>
          {p(': ')}
          <Pretty value={x} indent={inner} />
          {i < fields.length - 1 && p(',')}
          {'\n'}
        </Fragment>
      ))}
      {indent}
      {p('}')}
    </>
  );
}

/** Equal up to the formatter's rounding: numbers within a small tolerance, everything else exactly. */
function close(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 5e-4 * Math.max(1, Math.abs(a));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => close((a as any)[k], (b as any)[k]));
  }
  return a === b;
}

const tryFormat = (codec: Codec<any>, value: unknown, locale: string): string => {
  try {
    return codec.format(value, { locale });
  } catch (err) {
    return `⚠ ${(err as Error).message}`;
  }
};

function List({ rows }: { rows: readonly (readonly [ReactNode, string])[] }) {
  return (
    <dl>
      {rows.map(([name, text], i) => (
        <Fragment key={i}>
          <dt>{name}</dt>
          <dd>{text}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function Issues({ result }: { result: ParseResult<any> & { ok: false } }) {
  return (
    <>
      <p className="overline">issues</p>
      <div className="issues">
        {result.issues.map((issue, i) => (
          <div className="issue" key={i}>
            <span className="tag">{issue.code}</span>
            {issue.codec && <span className="from">{issue.codec}</span>}
            <p>{issue.message}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function Value({ choice, result, locale }: { choice: Choice; result: ParseResult<any> & { ok: true }; locale: string }) {
  const { codec } = choice;
  const text = tryFormat(codec, result.value, locale);
  const back = codec.parse(text, { locale });
  const trips = back.ok && close(back.value, result.value);
  // Under "any", the rest is about the codec that won: `anything` tags it, inside `approx`.
  const tagged = choice.id === 'any' ? result.value.value : undefined;
  const leaf: Choice | undefined = tagged ? leafById[tagged.codec] : choice;
  const value = tagged ? tagged.value : result.value;
  // An infinity (`∞ ft`) is the same in every unit, and the formatters are for numbers.
  const infinity = isInfinite(value);
  const units = infinity ? undefined : (leaf?.codec as { units?: Record<string, unknown> } | undefined)?.units;
  return (
    <>
      <p className="overline">
        <code>format(value, ctx)</code>
      </p>
      <p className="formatted">{text}</p>
      <p className="roundtrip">{trips ? <><b>✓</b> parse(format(value)) round-trips</> : '✗ does not round-trip'}</p>
      <List
        rows={locales
          .filter((l) => l !== locale)
          .slice(0, 5)
          .map((l) => [l, tryFormat(codec, result.value, l)] as const)}
      />
      {leaf?.formatters && !infinity && (
        <>
          <p className="overline">formatters</p>
          <List rows={leaf.formatters.map((f) => [f.call, tryFormat(f.codec, value, locale)] as const)} />
        </>
      )}
      {leaf && units && (
        <>
          <p className="overline">
            <code>convert({leaf.created ? 'codec' : `${(leaf.base ?? leaf).id}()`}, value, unit)</code>
          </p>
          <List
            rows={Object.keys(units)
              .filter((u) => u !== (value as Quantity).unit)
              .map((u) => [u, tryFormat(leaf.codec, convert(leaf.codec as any, value as Quantity, u), locale)] as const)}
          />
        </>
      )}
      {result.alternatives?.length ? (
        <div className="alts">
          <p className="overline">alternatives</p>
          <p>Other readings of this text. A UI can offer a choice instead of guessing.</p>
          <List rows={result.alternatives.map((a: any) => [choice.id === 'any' ? a.value.codec : codec.id, tryFormat(codec, a, locale)] as const)} />
        </div>
      ) : null}
    </>
  );
}

/** The code that does what the page just did, in an app. */
function snippet(choice: Choice): string {
  const name = choice.created ? choice.codec.id : (choice.base ?? choice).id;
  const lines = choice.created
    ? [`// your codec, from the editor, saved in this browser`, `import codec from './${name}';`, '']
    : choice.base
      ? [`// your edited ${name}, from the editor, saved in this browser`, `import { ${name} } from './${name}';`, '', `const codec = ${choice.call};`]
      : [...Object.entries(choice.imports).map(([from, names]) => `import { ${names.join(', ')} } from '${from}';`), '', `const codec = ${choice.call};`];
  lines.push(
    `const result = codec.parse(userInput);`,
    '',
    `result.ok // boolean`,
    `result.value // typesafe schema validated ${name === 'any' ? '' : `${name} `}value`,
    `codec.format(result.value) // standardized formatted string representation`,
  );
  return lines.join('\n');
}

export function Inspector({ choice, text, locale }: { choice: Choice; text: string; locale: string }) {
  const result = choice.codec.parse(text, { locale });
  return (
    <div className="panes" aria-live="polite">
      <section className="pane">
        <p className="overline">
          <code>
            codec.parse({str(text)}, {`{ locale: '${locale}' }`})
          </code>
        </p>
        <pre>
          <Pretty value={result} />
        </pre>
      </section>
      <section className="pane">{result.ok ? <Value choice={choice} result={result} locale={locale} /> : <Issues result={result} />}</section>
    </div>
  );
}

/** The codec in an app. It doesn't depend on the text, so it shows as soon as a codec is picked. */
export function Snippet({ choice }: { choice: Choice }) {
  return (
    <div className="code">
      <p className="overline">in your app</p>
      <pre>{snippet(choice)}</pre>
    </div>
  );
}
