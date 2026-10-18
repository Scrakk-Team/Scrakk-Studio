// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Puente IPC capturado al arrancar.
 *
 * El preload expone `window.__takeApi()` una sola vez. Este módulo lo consume
 * antes de que se cargue cualquier extensión, así que el resto de la app usa
 * `api` desde un closure y `window` ya no tiene el bridge completo. Los bundles
 * de extensión que se importan después NO pueden llamar `fs`, `terminal`,
 * `git`, `lsp` ni `llm` a través de `window.api`.
 *
 * (No es un sandbox de DOM: el bundle sigue en el mismo origen y puede ver el
 * documento. Elimina la vía directa de RCE por el bridge.)
 */

import type { WindowApi } from '@shared/window-controls'

type BootstrapWindow = {
  __takeApi?: () => WindowApi | null
  /** Fallback para tests/SSR que montan un `window.api` falso. */
  api?: WindowApi | null
}

// En tests/SSR no hay `window`: el módulo debe poder importarse igual.
const bootstrap =
  typeof window !== 'undefined' ? (window as unknown as BootstrapWindow) : undefined
const bridge = bootstrap?.__takeApi?.() ?? bootstrap?.api ?? null

/**
 * Fallback SOLO para tests que asignan `window.api` después del import: el
 * binding resuelve contra el global en cada acceso. En producción `bridge`
 * existe y este proxy nunca se usa.
 */
const testFallback = new Proxy({} as WindowApi, {
  get: (_target, property) => {
    if (typeof window === 'undefined') return undefined
    return (window as unknown as { api?: WindowApi }).api?.[property as keyof WindowApi]
  }
})

export const api = (bridge ?? testFallback) as WindowApi
