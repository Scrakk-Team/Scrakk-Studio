/**
 * Puente al paquete `vscode-languageclient` — la lib REAL, no una imitación.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ LA LIB REAL Y NO UN SHIM PROPIO
 *
 * En VS Code un language server NO es un contribution point: es CÓDIGO. La
 * extensión hace `new LanguageClient(...)` en su `activate` y toda la
 * negociación (initialize, capabilities, sync de documentos, diagnósticos,
 * requests) la lleva el paquete `vscode-languageclient`.
 *
 * Reimplementar eso es reimplementar el protocolo: la jugada honesta es
 * resolver ESE paquete y darle nuestro shim de `vscode`, que es exactamente lo
 * que hace VS Code. Así una extensión trae su versión fijada y nosotros sólo
 * ponemos el API.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DOS CASOS, Y EL ORDEN IMPORTA
 *
 * 1. **La extensión lo bundlea** (webpack/esbuild: el 90% de las reales). No
 *    pasa por acá: el `require` sale de su bundle y `vscode` sí lo intercepta
 *    el host. Es el caso ideal y no necesita nada nuestro.
 * 2. **La extensión lo declara como dependencia externa** y no lo trae
 *    instalado. Ahí entra este puente: se resuelve desde NUESTRO
 *    `node_modules` (donde es dependencia de la app) y el módulo que devuelve
 *    se comporta igual, porque sus propios `require` internos resuelven
 *    contra nuestra copia.
 *
 * La precedencia la decide `hostProcess`: **primero la copia de la extensión**
 * (su versión fijada manda) y este puente sólo como respaldo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MIGRACIÓN A OWEAR (leer antes de tocar)
 *
 * Igual que el resto del host: acá no hay nada de Electron ni de stdio. Cuando
 * Owear reemplace el runtime, este archivo se conserva o se tira entero — no
 * lo conoce ninguna extensión, sólo lo usa el intérprete de módulos del host.
 */

import { createRequire } from 'node:module'

/** El paquete (y sus submódulos `.../node`, `.../browser`). */
export const LANGUAGE_CLIENT_PREFIX = 'vscode-languageclient'

/** ¿Este specifier es del cliente LSP? (lo usa el intérprete de módulos). */
export function isLanguageClientRequest(request: string): boolean {
  return (
    request === LANGUAGE_CLIENT_PREFIX || request.startsWith(`${LANGUAGE_CLIENT_PREFIX}/`)
  )
}

/**
 * Specifier normalizado.
 *
 * El paquete desnudo (`require('vscode-languageclient')`) re-exporta el API de
 * navegador y toca `vscode` al cargar: en un host Node lo que la extensión
 * quiere es la entrada de Node. Se mapea, no se falla.
 */
export function normalizeLanguageClientRequest(request: string): string {
  return request === LANGUAGE_CLIENT_PREFIX ? `${LANGUAGE_CLIENT_PREFIX}/node` : request
}

interface ResolvedLanguageClient {
  module: unknown
  /** Ruta real cargada (evidencia para el log del host). */
  path: string
}

let cached: ResolvedLanguageClient | null = null
let failure: Error | null = null

/** `require` anclado a ESTE bundle (el host), no al de la extensión. */
function hostRequire(): NodeRequire {
  // `__filename` no existe si este módulo se carga como ESM (tests).
  const base = typeof __filename === 'string' ? __filename : process.cwd()
  return createRequire(base)
}

/**
 * Resuelve y carga la copia del host.
 *
 * Se cachea el ÉXITO y también el FRACASO: si el paquete no está instalado, la
 * segunda extensión que lo pida recibe el mismo error en vez de repetir el
 * camino de resolución en cada `require`.
 */
export function loadHostLanguageClient(request: string): ResolvedLanguageClient {
  if (cached) return cached
  if (failure) throw failure

  const specifier = normalizeLanguageClientRequest(request)
  try {
    const requireHost = hostRequire()
    const modulePath = requireHost.resolve(specifier)
    cached = { module: requireHost(modulePath), path: modulePath }
    return cached
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    failure = new Error(
      `[extension-host] \`${specifier}\` no está instalado. ` +
        `Esta extensión usa \`vscode-languageclient\` como dependencia externa sin traerla: ` +
        `bundleala en su bundle, o instalala en la app.\n  → ${detail}`
    )
    throw failure
  }
}

/** Solo para tests: olvida la caché (incluido el error cacheado). */
export function resetLanguageClientBridge(): void {
  cached = null
  failure = null
}
