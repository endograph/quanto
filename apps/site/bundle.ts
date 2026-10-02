// Bundles the page scripts. The packages resolve to their source, the same mapping as tsconfig.json's
// paths and the packages' own tests, so the site always runs the codecs in this repo, as one copy of
// each, and nothing needs building first.
import { resolve } from 'node:path';
import type { BunPlugin } from 'bun';

export const entrypoints = ['src/landing.tsx', 'src/playground.tsx', 'src/codecs.tsx'].map((p) => `${import.meta.dir}/${p}`);

const packages = resolve(import.meta.dir, '../../packages');
const sources: BunPlugin = {
  name: 'workspace-sources',
  setup(build) {
    build.onResolve({ filter: /^(@quantojs\/[a-z]+|quanto)(\/.*)?$/ }, ({ path }) => {
      const [, name, sub] = path.match(/^(@quantojs\/[a-z]+|quanto)(?:\/(.*))?$/)!;
      const dir = name === 'quanto' ? 'quanto' : name.slice('@quantojs/'.length);
      return { path: `${packages}/${dir}/src/${sub ? `${sub}/index.ts` : 'index.ts'}` };
    });
  },
};

/**
 * The source of every codec the playground can edit, by codec id: `codec-sources` is the whole map,
 * loaded with the editor, and `codec-sources/ids` just the ids, for the page. A codec can be edited when
 * its file is the whole codec: it imports only the core (`quanto`, `quanto/…`), or the other codecs of
 * @quantojs/common (`../length`), which the editor provides. So for now, @quantojs/common's one-file
 * codecs: the quantities, numbers, percent, proportion and ratio.
 */
const codecSources: BunPlugin = {
  name: 'codec-sources',
  setup(build) {
    build.onResolve({ filter: /^codec-sources(\/ids)?$/ }, ({ path }) => ({ path, namespace: 'codec-sources' }));
    build.onLoad({ filter: /.*/, namespace: 'codec-sources' }, async ({ path }) => {
      const sources: Record<string, string> = {};
      for await (const file of new Bun.Glob('*/index.ts').scan(`${packages}/common/src`)) {
        const dir = file.slice(0, -'/index.ts'.length);
        if (dir === 'formats') continue;
        const text = await Bun.file(`${packages}/common/src/${file}`).text();
        const imports = [...text.matchAll(/^(?:import|export)\b[^;]*?\bfrom '([^']+)'/gm)].map((m) => m[1]!);
        if (imports.every((from) => /^quanto(\/|$)/.test(from) || /^\.\.\/[a-z-]+$/.test(from))) {
          sources[dir.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = text;
        }
      }
      const value = path.endsWith('/ids') ? Object.keys(sources).sort() : sources;
      return { contents: `export default ${JSON.stringify(value)};`, loader: 'js' };
    });
  },
};

export async function bundle(minify: boolean): Promise<Map<string, Blob>> {
  const result = await Bun.build({
    entrypoints,
    target: 'browser',
    format: 'esm',
    minify,
    sourcemap: minify ? 'none' : 'inline',
    plugins: [sources, codecSources],
    // Shared code goes in chunks, and a dynamic import gets its own: the big field loads phone numbers
    // (libphonenumber-js's metadata) after the page.
    splitting: true,
    // React picks its build from NODE_ENV; the deployed site gets the production one.
    define: { 'process.env.NODE_ENV': JSON.stringify(minify ? 'production' : 'development') },
  });
  if (!result.success) throw new AggregateError(result.logs, 'site: bundling failed');
  return new Map(result.outputs.map((o) => [o.path.replace(/^\.\//, ''), o]));
}

/** quanto's version, from its package.json. */
const version: string = (await Bun.file(`${packages}/quanto/package.json`).json()).version;

/** A page's HTML with `%version%` filled in. */
export const stamp = (html: string): string => html.replaceAll('%version%', version);
