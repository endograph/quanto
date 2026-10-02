import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts', 'phone/index': 'src/phone/index.ts' },
  format: 'esm',
  dts: true,
  clean: true,
  fixedExtension: false,
  // quanto is a peer dependency and the other packages are dependencies: never bundled.
  external: [/^quanto(\/.*)?$/, /^@quantojs\//],
});
