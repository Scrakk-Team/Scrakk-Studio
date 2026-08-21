/**
 * Carga de extensiones del usuario — `.sef` instaladas en userData.
 *
 * El paquete compilado (`dist/index.js` o el `entry` del manifest) es un
 * ESM autocontenido que exporta `modules`: un mapa { rutaDelManifest:
 * Component }. El loader lo importa como data-URL (el renderer corre con
 * sandbox, sin acceso al filesystem de Node) y resuelve las rutas del
 * manifest contra ese mapa.
 *
 * Una extensión rota jamás tumba el boot: se saltea su contribución con un
 * warning y sigue con las demás.
 */

import { registerManifest } from './resolve'
import { ExtensionRegistry } from '../registry'
import { ExtensionTypeRegistry } from '../types'
import type { ExtensionManifest, ComponentResolver } from '../manifest'
import type { ComponentType } from 'react'

/** Archivo ESM autocontenido exportado por el paquete compilado. */
interface SefBundle {
  modules?: Record<string, ComponentType>
}

/** Entrada instalada expuesta por el puente nativo (window.api.extensions). */
export interface InstalledExtensionEntry {
  id: string
  name: string
  version: string
  author?: string
  dir: string
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Envuelve una extensión rota sin cortar el boot. */
async function safe(label: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (error) {
    console.warn(`[extensions] ${label}`, error)
  }
}

/**
 * Carga y registra UNA extensión instalada (se usa al boot y al instalar en
 * runtime desde la sección de ajustes).
 */
export async function registerInstalledExtension(entry: InstalledExtensionEntry): Promise<void> {
  const manifestRes = await window.api.fs.readFile(`${entry.dir}/manifest.json`)
  if (!manifestRes.success || typeof manifestRes.content !== 'string') return

  const manifest = JSON.parse(manifestRes.content) as ExtensionManifest
  if (!manifest?.id) return

  const bundleRes = await window.api.fs.readFile(`${entry.dir}/${manifest.entry ?? 'dist/index.js'}`)
  if (!bundleRes.success || typeof bundleRes.content !== 'string') return

  const bundleUrl = `data:text/javascript;base64,${toBase64(bundleRes.content)}`
  const bundle = (await import(/* @vite-ignore */ bundleUrl)) as SefBundle
  const modules = bundle.modules ?? {}

  // La validación de módulos faltantes vive en el schema de cada tipo
  // (vía hasModule); acá solo se entrega el mapa crudo del bundle.
  const resolver: ComponentResolver = {
    resolveComponent: (path) => () =>
      Promise.resolve({ default: modules[path] as ComponentType }),
    resolveIcon: (path) => modules[path],
    hasModule: (path) => path in modules
  }

  await registerManifest(manifest, resolver, false, entry.dir)
}

export async function loadInstalledExtensions(): Promise<void> {
  const api = window.api?.extensions
  if (!api) return // Web/dev sin puente nativo: solo builtin.

  const installed = await api.listInstalled()
  for (const entry of installed) {
    await safe(`extensión "${entry.id}"`, () => registerInstalledExtension(entry))
  }
}

/** Desregistra la extensión del usuario del runtime (tras desinstalar). */
export function unregisterInstalledExtension(id: string): void {
  ExtensionTypeRegistry.unregisterExtension(id)
  ExtensionRegistry.unregister(id)
}