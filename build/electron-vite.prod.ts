// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Perfil prod — bundle pequeño, parseo rápido, sin dev artifacts.
 *
 * - minify esbuild con los 3 flags.
 * - target chrome120 (Electron 43 trae Chromium reciente; configurable
 *   vía SCRAKK_PROD_TARGET env var).
 * - sourcemaps ocultos (no en producción final; útil para Sentry-style
 *   crash reports si alguna vez se quieren).
 * - `reportCompressedSize: true` para que vite reporte gzip size en
 *   stdout.
 * - `__DEV__` → false en código de producto (algunos libs lo respetan).
 * - `drop: ['debugger']` explícito para evitar breakpoints en bundle.
 *
 * El drop de `console.*` y el `manualChunks` se aplican en pasos
 * posteriores (Fase 2) cuando agreguemos chunks.ts y el plugin custom.
 *
 * El plan vive en /home/julian/.scrakk/sessions/.../plan.md
 */

import { defineConfig, mergeConfig } from 'electron-vite'
import { baseConfig } from './electron-vite.base'

const TARGET = process.env['SCRAKK_PROD_TARGET'] ?? 'chrome120'

/**
 * Marca de build (watermark). Cada build entregado lleva un id único: si se
 * filtra un binario, ese id lo atribuye a quién se le dio.
 * Ej: SCRAKK_BUILD_ID=tester-juan-2026-09 npm run dist
 */
const BUILD_ID = process.env['SCRAKK_BUILD_ID'] ?? 'local'

const prodConfig = mergeConfig(baseConfig, {
  renderer: {
    build: {
      target: TARGET,
      minify: 'esbuild',
      cssMinify: 'esbuild',
      cssCodeSplit: true,
      // SIN sourcemaps: 'hidden' igual escribe los .map (código fuente
      // completo). En un build que se entrega, eso filtra todo.
      sourcemap: false,
      reportCompressedSize: true,
      modulePreload: { polyfill: false },
      rollupOptions: {
        // El drop de console/debugger se aplica en Fase 2 con un plugin
        // que respeta `// keep-in-prod` (necesario para los console.debug
        // del puente Innerta).
      }
    },
    define: {
      __DEV__: 'false',
      __BUILD_ID__: JSON.stringify(BUILD_ID)
    }
  },
  main: {
    build: {
      minify: 'esbuild',
      sourcemap: false,
      rollupOptions: {
        // externalizeDepsPlugin ya está en base; nada extra.
      }
    },
    define: {
      __DEV__: 'false',
      __BUILD_ID__: JSON.stringify(BUILD_ID)
    }
  },
  preload: {
    build: {
      minify: 'esbuild',
      sourcemap: false
    },
    define: {
      __DEV__: 'false',
      __BUILD_ID__: JSON.stringify(BUILD_ID)
    }
  }
})

export default defineConfig(prodConfig)
