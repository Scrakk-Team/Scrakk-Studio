// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Perfil dev — optimizado para el ciclo de iteración.
 *
 * - HMR con host fijo `localhost` y PUERTO FIJO 7080 (`strictPort`).
 *   ⚠️ El puerto NUNCA debe caer a otro libre: el localStorage de Chromium
 *   se particiona por origen (`http://localhost:<puerto>`), así que si el
 *   puerto cambia entre reinicios la app arranca "vacía" (se pierde TODO:
 *   layouts, providers/API keys, chats...). Con `strictPort` Vite falla
 *   claro en vez de mudar de puerto en silencio.
 * - `optimizeDeps.include` curado: pre-bundle de deps grandes para que
 *   el primer import no pague el costo del bundling on-demand.
 * - Sin minify, sourcemaps inline, target esnext moderno.
 *
 * Cero impacto en prod (vite solo lo aplica si `mode === 'development'`).
 */

import { defineConfig, mergeConfig } from 'electron-vite'
import { baseConfig } from './electron-vite.base'

/** Lista curada de deps que se importan en el shell del renderer. */
const optimizeDepsInclude = [
  'react',
  'react-dom',
  'react-dom/client',
  'react-markdown',
  'remark-gfm',
  'remark-breaks',
  'rehype-raw',
  'rehype-sanitize',
  'prism-react-renderer',
  '@proicons/react',
  'vscode-jsonrpc',
  'vscode-languageserver-types'
]

const DEV_PORT = 7080

const devConfig = mergeConfig(baseConfig, {
  renderer: {
    // Origen ESTABLE: puerto fijo para que localStorage persista entre
    // reinicios (el storage de Chromium es por origen). strictPort == sin
    // fallback silencioso a otro puerto.
    server: {
      port: DEV_PORT,
      strictPort: true,
      hmr: { host: 'localhost' }
    },
    optimizeDeps: {
      include: optimizeDepsInclude
    },
    build: {
      sourcemap: 'inline',
      target: 'esnext'
    }
  }
})

export default defineConfig(devConfig)
