// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Carga de extensiones builtin — las que vienen compiladas con la app.
 *
 * Convención de carpeta: `builtin/<tipo>/<ext-id>/` — el PRIMER segmento
 * declara el tipo principal de la extensión (panels, themes, …). Una
 * extensión puede aportar otros tipos vía su manifest (p. ej. clock vive
 * en panels/ y además aporta activityBar + centerTabs), pero su hogar
 * define su tipo primario.
 *
 * Al buildear quedan dentro del bundle: los manifests se leen con un glob
 * eager y los componentes se resuelven con globs que Vite embebe. Nada se
 * lee del disco en runtime.
 *
 * Las desactivadas (enabled.ts) se saltan en boot y se pueden reactivar
 * en vivo con `registerBuiltinExtensionById`.
 */

import type { ComponentType } from 'react'
import { registerManifest } from './resolve'
import { isExtensionEnabled } from '../enabled'
import type { ExtensionManifest, ComponentResolver } from '../manifest'

const manifests = import.meta.glob<{ default: ExtensionManifest }>(
  '../builtin/*/*/manifest.json',
  { eager: true }
)

// Módulos de componentes (lazy) y de íconos (eager) de TODAS las builtin.
const componentModules = import.meta.glob('../builtin/*/**/*.{ts,tsx}')
const iconModules = import.meta.glob<{ default: ComponentType<{ size?: number }> }>(
  '../builtin/*/**/*.{ts,tsx}',
  { eager: true }
)

function buildBuiltinResolver(packageBase: string): ComponentResolver {
  const moduleKey = (path: string): string => `${packageBase}/${path}`
  return {
    resolveComponent: (path: string) => () => {
      const loader = componentModules[moduleKey(path)]
      if (!loader) return Promise.reject(new Error(`Módulo no encontrado: ${path}`))
      return loader().then((module) => ({
        default: (module as { default: ComponentType }).default
      }))
    },
    resolveIcon: (path: string) => iconModules[moduleKey(path)]?.default,
    hasModule: (path: string) =>
      moduleKey(path) in componentModules || moduleKey(path) in iconModules
  }
}

/**
 * Registra UNA builtin por id (boot y reactivación en vivo).
 * Devuelve false si no existe o está desactivada.
 */
export async function registerBuiltinExtensionById(extensionId: string): Promise<boolean> {
  if (!isExtensionEnabled(extensionId)) return false
  for (const [manifestPath, module] of Object.entries(manifests)) {
    const manifest = module.default
    if (manifest?.id !== extensionId) continue
    const packageBase = manifestPath.replace(/\/manifest\.json$/, '')
    await registerManifest(manifest, buildBuiltinResolver(packageBase), true)
    return true
  }
  return false
}

export async function loadBuiltinExtensions(): Promise<void> {
  for (const [, module] of Object.entries(manifests)) {
    const manifest = module.default
    if (!manifest?.id) continue
    const extensionId = manifest.id
    if (!isExtensionEnabled(extensionId)) continue
    try {
      await registerBuiltinExtensionById(extensionId)
    } catch (error) {
      console.warn(`[extensions] builtin "${extensionId}"`, error)
    }
  }
}
