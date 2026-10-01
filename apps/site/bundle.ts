// Bundles the page scripts. The packages resolve to their source, the same mapping as tsconfig.json's
// paths and the packages' own tests, so the site always runs the codecs in this repo, as one copy of
// each, and nothing needs building first.
import { resolve } from 'node:path';
import type { BunPlugin } from 'bun';

export const entrypoints = ['src/landing.tsx', 'src/playground.ts', 'src/demo.tsx', 'src/codecs.tsx'].map((p) => `${import.meta.dir}/${p}`);

const packages = resolve(import.meta.dir, '../../packages');
const sources: BunPlugin = {
  name: 'workspace-sources',
  setup(build) {
    build.onResolve({ filter: /^(quanto-datetime|quanto-react|quanto)(\/.*)?$/ }, ({ path }) => {
      const [, name, sub] = path.match(/^(quanto-datetime|quanto-react|quanto)(?:\/(.*))?$/)!;
      const dir = name === 'quanto' ? 'quanto' : name.slice('quanto-'.length);
      return { path: `${packages}/${dir}/src/${sub ? `${sub}/index.ts` : 'index.ts'}` };
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
    plugins: [sources],
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
