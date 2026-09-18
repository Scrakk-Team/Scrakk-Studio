/**
 * Build config base — invariantes que se comparten entre dev y prod.
 *
 * - Aliases (`@shared`, `@core`, `@features`, etc.).
 * - Define `__APP_VERSION__` desde package.json.
 * - externalizeDepsPlugin para main + preload (deps no se bundlean en Electron).
 *
 * Los perfiles (`dev` y `prod`) extienden este base y agregan lo suyo.
 *
 * El plan vive en /home/julian/.scrakk/sessions/.../plan.md
 */

import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const APP_VERSION = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8')).version as string
const appDefine = { __APP_VERSION__: JSON.stringify(APP_VERSION) }

const sharedAlias = {
  '@shared': resolve(__dirname, '..', 'src/shared')
}

const rendererRoot = resolve(__dirname, '..', 'src/renderer/src')

const rendererAlias = {
  ...sharedAlias,
  '@core': resolve(rendererRoot, 'core'),
  '@ui': resolve(rendererRoot, 'components/ui'),
  '@layout': resolve(rendererRoot, 'components/layout'),
  '@features': resolve(rendererRoot, 'features'),
  '@services': resolve(rendererRoot, 'services')
}

export const baseConfig = {
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    define: appDefine,
    build: {
      rollupOptions: {
        // Segundo entry: el Extension Host. Es un PROCESO aparte, así que
        // necesita su propio bundle ejecutable (lo lanza el manager con
        // `utilityProcess.fork`). Sin esto el host no existe en disco.
        input: {
          index: resolve(__dirname, '..', 'src/main/index.ts'),
          'extension-host': resolve(__dirname, '..', 'src/main/extensions/host/entry.ts'),
          // Tercer entry: el worker de tree-sitter DINÁMICO. Igual que el host,
          // es un proceso aparte (`utilityProcess.fork`) y necesita su bundle.
          'tree-sitter-worker': resolve(
            __dirname,
            '..',
            'src/main/extensions/treeSitter/entry.ts'
          )
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    define: appDefine
  },
  renderer: {
    plugins: [react()],
    resolve: { alias: rendererAlias },
    define: appDefine,
    server: {
      open: false,
      hmr: { host: 'localhost' }
    }
  }
} as const

export type BaseConfig = typeof baseConfig
