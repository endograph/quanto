// Codecs edited or created in the playground: run in this browser, against the page's own copy of the packages, and
// kept in localStorage. Nothing leaves the browser, and nothing loads someone else's code.
import type { Codec, Issue, ParseResult } from 'quanto';
import * as quanto from 'quanto';
import * as formats from 'quanto/formats';
import * as quantity from 'quanto/quantity';
import * as common from '@quantojs/common';

/** What edited code can import: the core, and @quantojs/common, which a codec's `../length` stands for. */
const modules: Readonly<Record<string, unknown>> = {
  quanto,
  'quanto/formats': formats,
  'quanto/quantity': quantity,
  '@quantojs/common': common,
};

function importModule(from: string): unknown {
  if (/^\.\.\/[a-z-]+$/.test(from)) return common;
  const module = modules[from];
  if (!module) throw new Error(`Can't import '${from}' here. The editor provides ${Object.keys(modules).map((m) => `'${m}'`).join(', ')}.`);
  return module;
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * The codec, made safe for the page: a parse that throws comes back as an issue, and a format that
 * throws (which a format may, on a malformed value) says so in its text, so a mistake can't take the
 * page down.
 */
function guard<T>(codec: Codec<T>): Codec<T> {
  return {
    ...codec,
    parse(text, ctx): ParseResult<T> {
      try {
        return codec.parse(text, ctx);
      } catch (err) {
        const issue = { code: 'invalid', message: `parse threw: ${message(err)}` } as const satisfies Issue;
        return { ok: false, issues: [issue] };
      }
    },
    format(value, ctx) {
      try {
        return codec.format(value, ctx);
      } catch (err) {
        return `⚠ format threw: ${message(err)}`;
      }
    },
  };
}

const isCodec = (value: unknown): value is Codec<unknown> =>
  typeof value === 'object' && value !== null && typeof (value as Codec<unknown>).id === 'string' && typeof (value as Codec<unknown>).parse === 'function' && typeof (value as Codec<unknown>).format === 'function';

/** What a module gives the playground: its default export, a codec, and the examples to type, if it exports them. */
export interface Compiled {
  readonly codec: Codec<any>;
  readonly examples?: readonly string[] | undefined;
}

/** Runs compiled code (CommonJS, as the editor compiles it). Throws if its default export isn't a codec. */
export function evaluate(js: string): Compiled {
  const exports: Record<string, unknown> = {};
  new Function('require', 'exports', js)(importModule, exports);
  if (!isCodec(exports.default)) throw new Error('The default export must be a codec: end with `export default length();`.');
  const { examples } = exports;
  const valid = Array.isArray(examples) && examples.length > 0 && examples.every((e) => typeof e === 'string');
  return { codec: guard(exports.default), examples: valid ? examples : undefined };
}

/** A codec as it's stored: the source to edit again, and the compiled code to run on load. */
export interface Saved {
  /** For an edited copy, the id of the catalog codec it started from. A new codec has none. */
  readonly base?: string | undefined;
  readonly source: string;
  readonly js: string;
}

const key = 'quanto-playground-codecs';

/** The saved codecs, by the id the picker knows them by: `edited:length` for a copy, `new:typeSize` for a new one. */
export function load(): Readonly<Record<string, Saved>> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}');
  } catch {
    return {};
  }
}

export function store(saved: Readonly<Record<string, Saved>>): void {
  localStorage.setItem(key, JSON.stringify(saved));
}
