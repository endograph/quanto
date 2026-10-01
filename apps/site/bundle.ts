// Bundles the page scripts. The packages resolve to their source, the same mapping as tsconfig.json's
// paths and the packages' own tests, so the site always runs the codecs in this repo, as one copy of
// each, and nothing needs building first.
import { resolve } from 'node:path';
import type { BunPlugin } from 'bun';

export const entrypoints = ['src/landing.ts', 'src/play.ts'].map((p) => `${import.meta.dir}/${p}`);

const packages = resolve(import.meta.dir, '../../packages');
const sources: BunPlugin = {
  name: 'workspace-sources',
  setup(build) {
    build.onResolve({ filter: /^(quanto-datetime|quanto)(\/.*)?$/ }, ({ path }) => {
      const [, name, sub] = path.match(/^(quanto-datetime|quanto)(?:\/(.*))?$/)!;
      const dir = name === 'quanto' ? 'quanto' : 'datetime';
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
  });
  if (!result.success) throw new AggregateError(result.logs, 'site: bundling failed');
  return new Map(result.outputs.map((o) => [o.path.replace(/^\.\//, ''), o]));
}
