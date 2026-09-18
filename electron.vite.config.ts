/**
 * Wrapper de build config — elige perfil dev o prod según `mode`.
 *
 * Las configs reales viven en `build/electron-vite.{base,dev,prod}.ts`
 * para que cada perfil sea testeable y editable sin tocar el wrapper.
 *
 * Switch manual: `mode: 'development'` (default) → dev. Para forzar
 * prod en build, `electron-vite build` corre con `NODE_ENV=production`
 * y Vite resuelve `mode: 'production'` solo.
 */

import { defineConfig } from 'electron-vite'
import devConfig from './build/electron-vite.dev'
import prodConfig from './build/electron-vite.prod'

const mode = process.env['NODE_ENV'] === 'production' ? 'production' : 'development'
export default defineConfig(mode === 'production' ? prodConfig : devConfig)
