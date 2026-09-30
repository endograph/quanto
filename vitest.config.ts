import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run against source: `quanto` and its subpaths resolve to src/, for the core's tests and for the
// packages in packages/*, which import quanto by name as their users do.
const src = (path: string): string => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^quanto$/, replacement: src('index.ts') },
      { find: /^quanto\/(.+)$/, replacement: src('$1/index.ts') },
    ],
  },
  test: {
    include: ['src/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
  },
});
