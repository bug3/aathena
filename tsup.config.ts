import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      'index': 'src/index.ts',
      'runtime/index': 'src/runtime/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
  },
  {
    entry: {
      'cli/index': 'src/cli/index.ts',
    },
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
  },
]);
