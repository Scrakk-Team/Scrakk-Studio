// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Externals de un bundle `.sef`.
 *
 * El bundler deja `react` (y los hooks del layout) como specifiers **bare**, y
 * el loader importa el bundle desde un **blob URL** — que no puede resolver
 * specifiers bare (`Failed to resolve module specifier "react/jsx-runtime"`).
 * Acá se reescriben esos specifiers a un módulo que re-exporta el namespace
 * REAL del módulo que la app ya tiene cargado.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO UN MÓDULO RE-EXPORTADOR (`export * from 'react'`)
 *
 * Porque el bundler lo recorta: un módulo que solo re-exporta y a quien nadie
 * usa no sobrevive al árbol — en el build quedaba
 * `export { x as __shimUrl, y as default }`, sin `useState` ni `jsx`, así que la
 * extensión no podía importarlos. Y tiene que ser la MISMA copia de React que la
 * app (con otra, los hooks de la extensión y del IDE no comparten dispatcher).
 *
 * Por eso el namespace se toma del módulo real (`import()` del código de la APP:
 * el bundler lo resuelve) y se genera un módulo que re-exporta **todos** sus
 * nombres. El fuente generado no puede `import` el namespace (no tiene su URL),
 * así que lo lee de un registro en `globalThis`, y el acceso dinámico
 * (`ns[nombre]`) es además lo que evita que se recorte algún nombre.
 */

/** Specifiers que un bundle puede dejar, y a quién se reescriben. */
export const BUNDLE_EXTERNALS = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  '@features/layout'
] as const

export type BundleExternal = (typeof BUNDLE_EXTERNALS)[number]

/** Clave del registro en `globalThis` (una sola, estable). */
const PROVIDED_REGISTRY = '__SCRAKK_PROVIDED__'

type Namespace = Record<string, unknown>
type Registry = Partial<Record<string, Namespace>>

/**
 * Módulos que la app le PRESTA al bundle: specifier → namespace real.
 *
 * Son `import()` de código de la app (con alias incluidos): el bundler los
 * resuelve a los módulos verdaderos, no a una copia.
 */
const PROVIDED_MODULES: Record<BundleExternal, () => Promise<Namespace>> = {
  react: () => import('react') as Promise<Namespace>,
  'react-dom': () => import('react-dom') as Promise<Namespace>,
  'react-dom/client': () => import('react-dom/client') as Promise<Namespace>,
  'react/jsx-runtime': () => import('react/jsx-runtime') as Promise<Namespace>,
  'react/jsx-dev-runtime': () => import('react/jsx-dev-runtime') as Promise<Namespace>,
  '@features/layout': () => import('@features/layout') as Promise<Namespace>
}

/** Objeto/URL factory inyectable: en Node no hay `URL.createObjectURL`. */
export interface ObjectUrlFactory {
  createObjectURL: (blob: Blob) => string
}

/**
 * URL de módulo para el bundle compilado.
 *
 * **Blob, nunca `data:`**: la CSP del renderer es
 * `script-src 'self' blob: 'wasm-unsafe-eval'` — `data:` NO está permitido, así
 * que importar el bundle como data-URL falla con
 * "Failed to fetch dynamically imported module" y el panel nunca aparece.
 */
export function createBundleModuleUrl(source: string, urls: ObjectUrlFactory = URL): string {
  return urls.createObjectURL(new Blob([source], { type: 'text/javascript' }))
}

/** Nombre de export válido tal cual (solo `default` y los identificadores). */
function exportName(name: string): string {
  if (name === 'default') return 'default'
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name)
}

/**
 * Fuente de un módulo que re-exporta TODOS los nombres de un namespace.
 *
 * `namespaceKey` es la clave del registro en `globalThis` de donde se leen los
 * valores en runtime (las funciones no se pueden serializar en el fuente).
 */
export function providedModuleSource(namespace: Namespace, namespaceKey: string): string {
  const lines = [`const ns = globalThis[${JSON.stringify(PROVIDED_REGISTRY)}][${JSON.stringify(namespaceKey)}];`]
  const exports: string[] = []
  let index = 0
  for (const name of Object.keys(namespace)) {
    const local = `n${index}`
    index += 1
    lines.push(`const ${local} = ns[${JSON.stringify(name)}];`)
    exports.push(`export { ${local} as ${exportName(name)} };`)
  }
  return [...lines, ...exports].join('\n')
}

let cached: Record<BundleExternal, string> | null = null

/**
 * URL de cada módulo prestado (se arma UNA vez y queda cacheada).
 *
 * Los blob URLs no se revocan: los módulos de las extensiones los importan
 * cuando se registran, no ahora.
 */
export async function providedModuleUrls(): Promise<Record<BundleExternal, string>> {
  if (cached) return cached

  const registry: Registry = {}
  const entries = Object.entries(PROVIDED_MODULES) as Array<
    [BundleExternal, () => Promise<Namespace>]
  >

  for (const [specifier, load] of entries) {
    const namespace = await load()
    // El acceso dinámico es lo que impide que el bundler recorte los nombres
    // que la app no usa (si no, una extensión no podría importarlos).
    for (const name of Object.keys(namespace)) void namespace[name]
    registry[specifier] = namespace
  }

  // El registro queda vivo: el fuente generado lo lee al evaluarse, cuando el
  // bundle de la extensión importe estos módulos.
  ;(globalThis as Record<string, unknown>)[PROVIDED_REGISTRY] = registry

  cached = Object.fromEntries(
    entries.map(([specifier]) => [
      specifier,
      createBundleModuleUrl(providedModuleSource(registry[specifier]!, specifier))
    ])
  ) as Record<BundleExternal, string>

  return cached
}

/** Escapa un specifier para meterlo en un RegExp. */
function escapeSpecifier(spec: string): string {
  return spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Reescribe los externals del bundle por las URLs de los módulos prestados.
 *
 * Solo toca strings entrecomillados que son **exactamente** el specifier (así
 * `"react"` no pisa `"react-dom"`) y solo en posición de import/export
 * (`from …`, `import "…"`, `import(…)`), nunca un string suelto del código.
 */
export function rewriteBundleExternals(source: string, urls: Record<string, string>): string {
  let out = source
  for (const [spec, url] of Object.entries(urls)) {
    // OJO con el backreference: el patrón es `(prefijo)(comilla)<spec>\2`, así
    // que la comilla es el grupo 2 (el 1 es `from `/`import `).
    const quoted = `(["'])${escapeSpecifier(spec)}\\2`
    const forms = [
      new RegExp(`(\\bfrom\\s*)${quoted}`, 'g'),
      new RegExp(`(\\bimport\\s*)${quoted}`, 'g'),
      new RegExp(`(\\bimport\\(\\s*)${quoted}`, 'g')
    ]
    for (const re of forms) {
      out = out.replace(re, (_match: string, prefix: string, quote: string) => `${prefix}${quote}${url}${quote}`)
    }
  }
  return out
}
