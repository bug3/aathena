import { defineConfig } from 'tsup';

// Externalize the full @aws-sdk, @smithy, and @aws-crypto scopes so the CJS
// build does not inline transitive Apache-2.0 code through dynamic imports
// (e.g. SSO credential providers). Direct deps are already external by
// default; the regex covers indirect ones tsup would otherwise bundle.
const external = [
  /^@aws-sdk\//,
  /^@smithy\//,
  /^@aws-crypto\//,
];

export default defineConfig([
  {
    entry: {
      'index': 'src/index.ts',
      'runtime/index': 'src/runtime/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    external,
  },
  {
    entry: {
      'cli/index': 'src/cli/index.ts',
    },
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    external,
  },
]);
