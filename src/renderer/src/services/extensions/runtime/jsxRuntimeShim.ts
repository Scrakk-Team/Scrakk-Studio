// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Shim de `react/jsx-runtime` para bundles `.sef` (ver `reactShim.ts`). */

export * from 'react/jsx-runtime'

/**
 * Su PROPIA URL como módulo. El loader la usa para reescribir el specifier bare
 * del bundle: importar esa URL devuelve ESTE módulo (misma instancia, mismo
 * React) en vez de una `data:` URL que no puede resolver bare specifiers.
 */
export const __shimUrl = import.meta.url
