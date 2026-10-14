// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Externals de un bundle `.sef`.
 *
 * El bundler deja `react` (y los hooks del layout) como specifiers **bare**, y
 * el loader importa el bundle como `data:` URL — y una `data:` URL **no puede
 * resolver specifiers bare**: `Failed to resolve module specifier "react"`.
 * Resultado: un panel instalado no cargaba nunca.
 *
 * Acá se reescriben esos specifiers a la URL REAL del shim correspondiente
 * antes de importar. Los shims se importan **dinámicamente** a propósito: así el
 * bundler les da su propio chunk (una URL estable) y, sobre todo, la extensión
 * comparte la **misma copia de React** que la app — con otra copia, los hooks de
 * la extensión y del IDE no compartirían el dispatcher.
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

let cached: Record<BundleExternal, string> | null = null

/** URL de cada shim (se resuelve la primera vez y queda cacheada). */
export async function shimUrls(): Promise<Record<BundleExternal, string>> {
  if (cached) return cached
  const [react, reactDom, reactDomClient, jsx, jsxDev, layout] = await Promise.all([
    import('../runtime/reactShim'),
    import('../runtime/reactDomShim'),
    import('../runtime/reactDomClientShim'),
    import('../runtime/jsxRuntimeShim'),
    import('../runtime/jsxDevRuntimeShim'),
    import('../runtime/layoutShim')
  ])
  cached = {
    react: react.__shimUrl,
    'react-dom': reactDom.__shimUrl,
    'react-dom/client': reactDomClient.__shimUrl,
    'react/jsx-runtime': jsx.__shimUrl,
    'react/jsx-dev-runtime': jsxDev.__shimUrl,
    '@features/layout': layout.__shimUrl
  }
  return cached
}

/** Escapa un specifier para meterlo en un RegExp. */
function escapeSpecifier(spec: string): string {
  return spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Reescribe los externals del bundle por las URLs de los shims.
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
