// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Shim de `react` para bundles `.sef`.
 *
 * Un paquete compilado deja `react` como specifier BARE y el loader lo importa
 * como `data:` URL — y una `data:` URL no puede resolver specifiers bare. El
 * loader reescribe el specifier a la URL REAL de este módulo, que re-exporta la
 * MISMA copia de React que usa la app (si fuera otra, los hooks/contexts de la
 * extensión y del IDE no compartirían el dispatcher).
 */

// @ts-expect-error — `@types/react` es CJS (`export =`) y TS no permite
// `export *` sobre eso. En runtime es ESM válido y lo que importa es que la
// extensión vea el namespace REAL (la misma copia de React que la app).
export * from 'react'
export { default } from 'react'

/**
 * Su PROPIA URL como módulo. El loader la usa para reescribir el specifier bare
 * del bundle: importar esa URL devuelve ESTE módulo (misma instancia, mismo
 * React) en vez de una `data:` URL que no puede resolver bare specifiers.
 */
export const __shimUrl = import.meta.url
