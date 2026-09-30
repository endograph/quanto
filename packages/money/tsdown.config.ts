import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: 'esm',
  dts: true,
  clean: true,
  fixedExtension: false,
  // quanto is a peer dependency: never bundled.
  external: [/^quanto(\/.*)?$/],
});
