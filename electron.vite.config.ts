import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

/**
 * Alias compartidos: cada módulo importa por alias, no por rutas relativas
 * largas → los módulos son independientes de su posición en el árbol.
 */
const sharedAlias = {
  '@shared': resolve('src/shared')
}

const rendererRoot = resolve('src/renderer/src')

const rendererAlias = {
  ...sharedAlias,
  '@core': resolve(rendererRoot, 'core'),
  '@ui': resolve(rendererRoot, 'components/ui'),
  '@layout': resolve(rendererRoot, 'components/layout'),
  '@features': resolve(rendererRoot, 'features'),
  '@services': resolve(rendererRoot, 'services')
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias }
  },
  renderer: {
    plugins: [react()],
    resolve: { alias: rendererAlias }
  }
})
