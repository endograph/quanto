import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'quantity/index': 'src/quantity/index.ts',
    'formats/index': 'src/formats/index.ts',
    'testing/index': 'src/testing/index.ts',
  },
  format: 'esm',
  dts: true,
  clean: true,
  fixedExtension: false,
});
