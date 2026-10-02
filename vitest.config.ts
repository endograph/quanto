import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run against source: `quanto`, `@quantojs/*` and their subpaths resolve to packages/*/src, for each
// package's own tests and for the others, which import them by name as their users do.
const packages = (path: string): string => fileURLToPath(new URL(`./packages/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^quanto$/, replacement: packages('quanto/src/index.ts') },
      { find: /^quanto\/(.+)$/, replacement: packages('quanto/src/$1/index.ts') },
      { find: /^@quantojs\/([a-z]+)$/, replacement: packages('$1/src/index.ts') },
      { find: /^@quantojs\/([a-z]+)\/(.+)$/, replacement: packages('$1/src/$2/index.ts') },
    ],
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
  },
});
