// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Bundles the CLI to `dist/index.js` (ESM, Node).
 *
 * `esbuild` and `fflate` stay **external** so they resolve from the consumer's
 * install (they are declared as runtime dependencies) instead of being frozen
 * into the published artifact.
 */

import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: ['esbuild', 'fflate'],
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info'
})
