// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Panel de extensión aislado.
 *
 * El bundle React de una extensión instalada NO se importa en el renderer.
 * Se sirve desde `scrakk-ext://<id>` y corre dentro de un iframe con su propio
 * origen y su propia copia de React. Así no ve `window.api`, no comparte el DOM
 * del IDE y no puede leer su `localStorage`.
 *
 * Un paquete legacy puede pedir `"ui": { "legacyBundle": true }` en el manifest
 * para volver al camino anterior (bundle en el renderer, sin aislamiento).
 */

import type { ComponentType, JSX } from 'react'

export function isolatedPanelUrl(extensionId: string, entry: string, component: string): string {
  const params = new URLSearchParams({ entry, component })
  return `scrakk-ext://${extensionId}/__bundle__/host.html?${params.toString()}`
}

/** Fábrica del componente que monta el layout: solo dibuja el iframe. */
export function makeIsolatedPanel(
  extensionId: string,
  entry: string,
  component: string
): ComponentType {
  const src = isolatedPanelUrl(extensionId, entry, component)
  return function IsolatedExtensionPanel(): JSX.Element {
    return (
      <iframe
        src={src}
        title={`${extensionId}:${component}`}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          border: 0,
          background: 'transparent'
        }}
      />
    )
  }
}
