import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'types/index': 'src/types/index.ts',
    'formats/index': 'src/formats/index.ts',
  },
  format: 'esm',
  dts: true,
  clean: true,
  fixedExtension: false,
});
