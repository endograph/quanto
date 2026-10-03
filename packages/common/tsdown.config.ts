import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'money/index': 'src/money/index.ts',
    'odds/index': 'src/odds/index.ts',
    'css-color/index': 'src/css-color/index.ts',
    'formats/index': 'src/formats/index.ts',
  },
  format: 'esm',
  dts: true,
  clean: true,
  fixedExtension: false,
  // quanto is a peer dependency: never bundled.
  external: [/^quanto(\/.*)?$/],
});
