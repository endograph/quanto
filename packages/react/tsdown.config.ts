import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: 'esm',
  dts: true,
  clean: true,
  fixedExtension: false,
  // quanto and react are peer dependencies: never bundled.
  external: [/^quanto(\/.*)?$/, /^react(\/.*)?$/],
});
