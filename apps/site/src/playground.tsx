// The playground: pick a codec, and the big field reads with it. It types the codec's examples until you
// take over, and under it the inspector shows everything the codec makes of the text. A codec in one
// file can be edited in place, and a new one written from a template: either is compiled and run in this
// browser, and the field reads with it.
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Codec } from 'quanto';
import { QuantoProvider } from '@quantojs/react';
import editable from 'codec-sources/ids';
import { byId, entries, locales } from './catalog';
import { Omni } from './demo/omni';
import { glyphs } from './glyphs';
import { Inspector, Snippet, type Choice } from './playground/inspector';
import { evaluate, load, store, type Compiled, type Saved } from './playground/runtime';

const Editor = lazy(() => import('./playground/editor'));

const editedId = (base: string): string => `edited:${base}`;
const createdId = (codec: Codec<any>): string => `new:${codec.id}`;

/** A saved codec as one to pick, by its id. Formatters stay with the original: they were built from it. */
function saved(id: string, { codec, examples }: Compiled): Choice | undefined {
  if (id.startsWith('new:')) return { id, codec, call: 'codec', imports: {}, examples: examples ?? [], created: true };
  const base = byId[id.slice('edited:'.length)];
  if (!id.startsWith('edited:') || !base) return undefined;
  const { formatters: _, featured: __, ...rest } = base;
  return { ...rest, id, codec, examples: examples ?? base.examples, base };
}

/** The codecs saved in this browser, run. One that no longer runs is left out, and stays saved to fix. */
function initialCodecs(): Record<string, Compiled> {
  const codecs: Record<string, Compiled> = {};
  for (const [id, { js }] of Object.entries(load())) {
    try {
      codecs[id] = evaluate(js);
    } catch {}
  }
  return codecs;
}

/** What the editor has open: a catalog codec's copy (`base`), or a new codec. `id` is what it's saved as, once it is. */
interface Editing {
  readonly id?: string | undefined;
  readonly base?: string | undefined;
}

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

/** Keeps the URL on what's on show, so it can be shared or reloaded: the codec, the text and the locale. */
function useUrl(id: string, text: string, typing: boolean, locale: string): void {
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('codec', id);
    // While the field types its examples, the text is theirs, not something to come back to.
    if (typing) url.searchParams.delete('q');
    else url.searchParams.set('q', text);
    if (locale === 'en-US') url.searchParams.delete('locale');
    else url.searchParams.set('locale', locale);
    history.replaceState(null, '', url);
  }, [id, text, typing, locale]);
}

/**
 * The inspector, for the text once it's settled. While the field types an example it keeps the last one,
 * hidden, so it doesn't twitch through every half-typed prefix and the page doesn't jump. The snippet
 * doesn't depend on the text, so it's always there.
 */
function Inspect({ choice, text, auto, typing, locale }: { choice: Choice; text: string; auto: boolean; typing: boolean; locale: string }) {
  useUrl(choice.id, text, auto, locale);
  const settled = useRef<string>(undefined);
  if (!typing) settled.current = text;
  return (
    <div className="inspect">
      {settled.current !== undefined && (
        <div className={typing ? 'settling' : undefined}>
          <Inspector choice={choice} text={settled.current} locale={locale} />
        </div>
      )}
      <Snippet choice={choice} />
    </div>
  );
}

const params = new URLSearchParams(location.search);

function Page() {
  const [locale, setLocale] = useState(() => (locales.includes(params.get('locale') ?? '') ? params.get('locale')! : 'en-US'));
  const [formatOnBlur, setFormatOnBlur] = useState(false);
  const [restoreOnEdit, setRestoreOnEdit] = useState(false);
  const display = formatOnBlur ? 'formatted-on-blur' : 'raw';

  const [codecs, setCodecs] = useState(initialCodecs);
  const choices: readonly Choice[] = [...entries, ...Object.entries(codecs).flatMap(([id, compiled]) => saved(id, compiled) ?? [])];
  const find = (id: string): Choice | undefined => choices.find((c) => c.id === id);

  const [id, setId] = useState(() => (find(params.get('codec') ?? '') ? params.get('codec')! : 'any'));
  const choice: Choice = find(id) ?? byId.any!;
  // The field starts over when the codec, the locale or a saved copy changes. A new codec types its
  // examples; otherwise it keeps the text it had.
  const [initial, setInitial] = useState(() => params.get('q') ?? undefined);
  const [generation, setGeneration] = useState(0);
  const text = useRef(initial ?? '');
  const [editing, setEditing] = useState<Editing>();

  const select = (next: string) => {
    setId(next);
    setInitial(undefined);
  };
  const restart = () => {
    setInitial(text.current);
    setGeneration((g) => g + 1);
  };

  // What the edit button opens: the copy, or a copy of the catalog codec, or the codec made here.
  const edit: Editing | undefined = choice.created
    ? { id: choice.id }
    : choice.base
      ? { id: choice.id, base: choice.base.id }
      : editable.includes(choice.id)
        ? { id: editedId(choice.id), base: choice.id }
        : undefined;

  /** Saves what the editor has open, and reads with it. A new codec is saved by its id, so two can't share one. */
  const save = (open: Editing, value: Saved, compiled: Compiled): string | undefined => {
    const id = open.base ? editedId(open.base) : createdId(compiled.codec);
    // What was open is replaced, even under a new id; anything else with that id is someone else's.
    const without = <T,>(all: Readonly<Record<string, T>>): Record<string, T> => Object.fromEntries(Object.entries(all).filter(([key]) => key !== open.id));
    const rest = without(load());
    if (rest[id]) return `There's already a codec with the id '${compiled.codec.id}'. Give this one another.`;
    store({ ...rest, [id]: value });
    setCodecs((c) => ({ ...without(c), [id]: compiled }));
    setEditing(undefined);
    // A new codec types its examples. An edit keeps the text, to see what changed.
    if (open.id) {
      setId(id);
      restart();
    } else select(id);
    return undefined;
  };
  const discard = (open: Editing & { id: string }) => {
    const { [open.id]: _, ...rest } = load();
    store(rest);
    setCodecs(({ [open.id]: _, ...c }) => c);
    setEditing(undefined);
    if (open.base) {
      setId(open.base);
      restart();
    } else select('any');
  };

  const tabs = choices.filter((c) => c.featured || c.base || c.created);
  const more = choices.filter((c) => !c.featured && !c.base && !c.created);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement || document.querySelector('dialog[open]');
      if (typing) return;
      if (e.key === '/') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('#hero')?.select();
      }
      // In the order the picker shows them: the tabs, then the menu.
      if (e.key === '[' || e.key === ']') {
        const order = [...tabs, ...more];
        const i = order.findIndex((c) => c.id === choice.id) + (e.key === ']' ? 1 : -1);
        select(order[(i + order.length) % order.length]!.id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const label = (c: Choice) => (c.base ? `${c.base.id} (edited)` : c.created ? c.codec.id : c.id);

  return (
    <QuantoProvider ctx={{ locale }}>
      <header>
        <div className="brand">
          <Mark />
          <a href="../index.html">quanto</a>
        </div>
        <nav className="views" aria-label="Site">
          <a href="./index.html" aria-current="page">playground</a>
          <a href="../codecs/index.html">codecs</a>
        </nav>
        <label className="ctx">
          <span className="label">ctx.locale</span>
          <select
            value={locale}
            onChange={(e) => {
              setLocale(e.target.value);
              restart();
            }}
          >
            {locales.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      </header>

      <section className="hero grid-bg">
        <div className="hero-inner">
          <div className="picker-row">
            <div className="tabs" role="tablist" aria-label="Codec">
              {tabs.map((c) => (
                <button key={c.id} className={c.base || c.created ? 'tab edited' : 'tab'} role="tab" aria-selected={c.id === choice.id} onClick={() => select(c.id)}>
                  {label(c)}
                </button>
              ))}
              <select className={more.includes(choice) ? 'more active' : 'more'} aria-label="More codecs" value={more.includes(choice) ? choice.id : ''} onChange={(e) => e.target.value && select(e.target.value)}>
                <option value="">more…</option>
                {more.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id}
                  </option>
                ))}
              </select>
            </div>
            <span className="actions">
              {edit && (
                <button type="button" className="edit" onClick={() => setEditing(edit)} title={choice.created ? 'Edit your codec' : `Edit ${edit.base}'s source and read with your copy`}>
                  <span aria-hidden="true">✎</span> edit
                </button>
              )}
              <button type="button" className="edit" onClick={() => setEditing({})} title="Write a codec of your own, from a template">
                <span aria-hidden="true">+</span> create codec
              </button>
            </span>
          </div>

          <div className="config" role="toolbar" aria-label="Field behaviour">
            <label className="switch">
              <input type="checkbox" checked={formatOnBlur} onChange={(e) => setFormatOnBlur(e.target.checked)} />
              <span className="track" />
              <span>
                format on blur <small>display="{display}"</small>
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

          <Omni
            key={`${choice.id} ${locale} ${generation}`}
            codec={choice.codec}
            examples={choice.examples}
            initial={initial}
            display={display}
            restoreOnEdit={restoreOnEdit}
            inspect={(value, auto, typing) => {
              text.current = value;
              return <Inspect choice={choice} text={value} auto={auto} typing={typing} locale={locale} />;
            }}
          />
        </div>
      </section>

      {editing && (
        <Suspense>
          <Editor
            base={editing.base}
            saved={editing.id ? load()[editing.id] : undefined}
            name={editing.id && !editing.base ? codecs[editing.id]?.codec.id : undefined}
            onSave={(value, compiled) => save(editing, value, compiled)}
            onDiscard={editing.id && load()[editing.id] ? () => discard({ ...editing, id: editing.id! }) : undefined}
            onClose={() => setEditing(undefined)}
          />
        </Suspense>
      )}

      <footer>
        <span className="keys">
          <kbd>/</kbd> focus · <kbd>[</kbd> <kbd>]</kbd> switch codec
        </span>
      </footer>
    </QuantoProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Page />);
