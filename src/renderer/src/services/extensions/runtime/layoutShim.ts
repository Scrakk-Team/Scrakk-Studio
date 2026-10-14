// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Shim de `@features/layout` para bundles `.sef`.
 *
 * Es lo que documentan las guías (`usePanelTitle`, `usePanelId`,
 * `HeaderActionButton`): el loader reescribe el import a la URL de este módulo.
 */

export * from '@features/layout'

/**
 * Su PROPIA URL como módulo. El loader la usa para reescribir el specifier bare
 * del bundle: importar esa URL devuelve ESTE módulo (misma instancia, mismo
 * React) en vez de una `data:` URL que no puede resolver bare specifiers.
 */
export const __shimUrl = import.meta.url
