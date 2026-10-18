#!/usr/bin/env node
// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Compila el runtime que corre DENTRO del iframe aislado de extensiones.
 * Sale a `out/renderer/extension-runtime.js` (React + ReactDOM + jsx-runtime)
 * y `out/renderer/extension-layout-stub.js`.
 *
 * Lo ejecuta `npm run build` y `predev`; no se empaqueta en el bundle del IDE.
 */

import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

await mkdir('out/renderer', { recursive: true })

const common = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  logLevel: 'info'
}

await Promise.all([
  build({
    ...common,
    entryPoints: ['src/renderer/src/extensionRuntime/index.ts'],
    outfile: 'out/renderer/extension-runtime.js'
  }),
  build({
    ...common,
    entryPoints: ['src/renderer/src/extensionRuntime/layoutStub.ts'],
    outfile: 'out/renderer/extension-layout-stub.js'
  })
])
