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
import { forgetExtensionDir, setExtensionDir } from '../extensionDirs'
import { ExtensionRegistry } from '../registry'
import { ExtensionTypeRegistry } from '../types'
import { isExtensionEnabled } from '../enabled'
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
 *
 * Soporta extensiones SOLO-DATA (temas, fileIcons) sin bundle JS: si el
 * manifest no declara kinds de código (panels/activityBar/centerTabs) o el
 * entry no existe en disco, se registra con un resolver vacío en vez de
 * abortar. Una extensión rota jamás tumba el boot.
 */
export async function registerInstalledExtension(entry: InstalledExtensionEntry): Promise<void> {
  // El directorio se registra ANTES de las contribuciones: un tipo que necesita
  // rutas absolutas del paquete (el tokenizador de gramáticas) las resuelve al
  // registrar, no al usar.
  setExtensionDir(entry.id, entry.dir)

  const manifestRes = await window.api.fs.readFile(`${entry.dir}/manifest.json`)
  if (!manifestRes.success || typeof manifestRes.content !== 'string') return

  const manifest = JSON.parse(manifestRes.content) as ExtensionManifest
  if (!manifest?.id) return
  // Desactivada → no registrar (ni en boot ni en vivo sin reactivar antes).
  if (!isExtensionEnabled(manifest.id)) return

  const contributes = manifest.contributes ?? {}
  const needsBundle =
    Array.isArray(contributes.panels) ||
    Array.isArray(contributes.activityBar) ||
    Array.isArray(contributes.centerTabs)

  let modules: Record<string, ComponentType> = {}
  if (needsBundle) {
    const bundleRes = await window.api.fs.readFile(`${entry.dir}/${manifest.entry ?? 'dist/index.js'}`)
    if (!bundleRes.success || typeof bundleRes.content !== 'string') return
    const bundleUrl = `data:text/javascript;base64,${toBase64(bundleRes.content)}`
    const bundle = (await import(/* @vite-ignore */ bundleUrl)) as SefBundle
    modules = bundle.modules ?? {}
  }

  // La validación de módulos faltantes vive en el schema de cada tipo
  // (vía hasModule); aquí solo se entrega el mapa crudo del bundle.
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

  // Primero re-traducir las VSIX del traductor viejo: el materializado en
  // disco cambia ANTES de leerlo (así el boot registra la versión nueva).
  try {
    const re = await api.retranslateVsix()
    if (re.updated.length > 0) {
      console.log('[extensions] re-traducidas:', re.updated.join(', '))
      if (re.skipped.length > 0) {
        console.warn('[extensions] re-traducción omitida (sin .vsix original):', re.skipped.join(', '))
      }
    }
  } catch (error) {
    console.warn('[extensions] re-traducción falló (continuando con lo instalado):', error)
  }

  const installed = await api.listInstalled()
  for (const entry of installed) {
    await safe(`extensión "${entry.id}"`, () => registerInstalledExtension(entry))
  }
}

/** Desregistra la extensión del usuario del runtime (tras desinstalar). */
export function unregisterInstalledExtension(id: string): void {
  ExtensionTypeRegistry.unregisterExtension(id)
  ExtensionRegistry.unregister(id)
  forgetExtensionDir(id)
}