// The codec editor: a codec's own source, or a template for a new one, in a modal, compiled and run in
// this browser on save. Loaded only when it opens: it brings CodeMirror, sucrase (which strips the
// TypeScript) and the sources.
import { useEffect, useRef, useState } from 'react';
import { javascript } from '@codemirror/lang-javascript';
import { syntaxHighlighting } from '@codemirror/language';
import { EditorView, keymap } from '@codemirror/view';
import { classHighlighter } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { transform } from 'sucrase';
import sources from 'codec-sources';
import { evaluate, type Compiled, type Saved } from './runtime';

/** The source to start from: the codec's file as it ships, and a last line that says what the playground runs. */
const original = (base: string): string => `${sources[base]!.trimEnd()}\n\n// What the playground runs.\nexport default ${base}();\n`;

/** A new codec's starting point: a small quantity, with what each part is for. */
const template = `import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

// A quantity is a table of units: each one's size in the base unit, and the ways people write it.
// quanto reads the number and the unit, and does the rest: locales, compound forms, conversion.
// For something that isn't a quantity, start from \`defineCodec\`, also from 'quanto'.

/** CSS's absolute lengths, for type and layout. Base unit: the pixel. */
const typeSizeUnits = {
  px: { toBase: 1, aliases: ['px', 'pixel', 'pixels'] },
  pt: { toBase: 4 / 3, aliases: ['pt', 'point', 'points'] },
  pc: { toBase: 16, aliases: ['pc', 'pica', 'picas'] },
  in: { toBase: 96, aliases: ['in', 'inch', 'inches', '"'] },
  mm: { toBase: 96 / 25.4, aliases: ['mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres'] },
} satisfies Record<string, UnitDefinition>;

type TypeSizeUnit = keyof typeof typeSizeUnits;

/** Type sizes: \`12px\`, \`9 pt\`, \`1 pica\`. */
export const typeSize = <C extends TypeSizeUnit = TypeSizeUnit>(options?: QuantityOptions<TypeSizeUnit, C>): QuantityCodec<TypeSizeUnit, C> =>
  quantity<typeof typeSizeUnits, C>({ id: 'typeSize', units: typeSizeUnits, ...options });

// What the playground types, and offers to try.
export const examples = ['12px', '9 pt', '1 pica', '0.5 in', '12'];

// What the playground runs. Its id names it in the picker.
export default typeSize();
`;

/** Compiles the source and runs it. Throws with what went wrong: a syntax error, an error running it, or no codec. */
function compile(source: string): { js: string; compiled: Compiled } {
  const { code: js } = transform(source, { transforms: ['typescript', 'imports'], disableESTransforms: true });
  return { js, compiled: evaluate(js) };
}

export default function Editor(props: {
  /** The catalog codec whose copy this is. Without one, it's a new codec. */
  base?: string | undefined;
  /** What's saved, when there's something: the copy, or the new codec. */
  saved?: Saved | undefined;
  /** The new codec's id, once it has one, for the title. */
  name?: string | undefined;
  /** Saves it, or says why it can't. */
  onSave: (saved: Saved, compiled: Compiled) => string | undefined;
  /** Throws away what's saved. */
  onDiscard?: (() => void) | undefined;
  onClose: () => void;
}) {
  const { base, saved, name, onSave, onDiscard, onClose } = props;
  const start = base ? original(base) : template;
  const dialog = useRef<HTMLDialogElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const [error, setError] = useState<string>();

  const save = () => {
    const source = view.current!.state.doc.toString();
    try {
      const { js, compiled } = compile(source);
      setError(onSave({ base, source, js }, compiled));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  // The editor keeps the first handlers it's given, so it calls through a ref to the current ones.
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    dialog.current!.showModal();
    view.current = new EditorView({
      doc: saved?.source ?? start,
      parent: host.current!,
      extensions: [
        keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => (saveRef.current(), true) }]),
        basicSetup,
        javascript({ typescript: true }),
        syntaxHighlighting(classHighlighter),
        EditorView.updateListener.of((update) => update.docChanged && setError(undefined)),
      ],
    });
    view.current.focus();
    return () => view.current!.destroy();
  }, []);

  const reset = () => {
    const doc = view.current!.state.doc;
    view.current!.dispatch({ changes: { from: 0, to: doc.length, insert: start } });
  };

  return (
    <dialog className="editor" ref={dialog} onClose={onClose} aria-labelledby="editor-title">
      <header>
        <h2 id="editor-title">
          {base || name ? (
            <>
              Edit <code>{base ?? name}</code>
            </>
          ) : (
            'New codec'
          )}
        </h2>
        <p>
          {base ? (
            <>
              Its source, as it ships in <code>@quantojs/common</code>. Save, and the playground reads with your copy.
            </>
          ) : (
            <>
              A codec of your own, from a template. Save, and the playground reads with it.
            </>
          )}{' '}
          It runs and stays in this browser.
        </p>
      </header>
      <div className="editor-host" ref={host} />
      <footer>
        <p className="editor-error" role="alert">
          {error}
        </p>
        <span className="editor-actions">
          <button type="button" className="chip" onClick={reset} title={base ? 'Put the shipped source back in the editor' : 'Put the template back in the editor'}>
            {base ? 'reset to original' : 'reset to template'}
          </button>
          {onDiscard && (
            <button type="button" className="chip" onClick={onDiscard} title={base ? 'Delete your copy and go back to the shipped codec' : 'Delete this codec'}>
              {base ? 'discard my copy' : 'delete codec'}
            </button>
          )}
          <button type="button" className="chip" onClick={() => dialog.current!.close()}>
            cancel
          </button>
          <button type="button" className="btn" onClick={save}>
            save and use <kbd>⌘S</kbd>
          </button>
        </span>
      </footer>
    </dialog>
  );
}
