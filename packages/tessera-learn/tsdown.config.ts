import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    'plugin/index': 'src/plugin/index.ts',
    'plugin/cli': 'src/plugin/cli.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  fixedExtension: false,
});
