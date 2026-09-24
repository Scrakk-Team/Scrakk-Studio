// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Visual de una tool de extensión.
 *
 * El paquete trae su propio módulo React (igual que las tools internas tienen
 * su carpeta `visual/`). Se carga al montar, sin `React.lazy` ni Suspense (el
 * chat no tiene boundary): mientras llega el módulo no se pinta nada y el
 * componente no bloquea el hilo.
 */

import { useEffect, useState, type ComponentType, type JSX } from 'react'

export interface ToolVisualProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

interface ExtensionToolVisualProps extends ToolVisualProps {
  /** Ruta del módulo dentro del paquete. */
  path: string
  /** Loader del paquete (import dinámico). */
  resolve: (path: string) => () => Promise<{ default: ComponentType<ToolVisualProps> }>
}

export function ExtensionToolVisual({
  path,
  resolve,
  args,
  result,
  status
}: ExtensionToolVisualProps): JSX.Element | null {
  const [Component, setComponent] = useState<ComponentType<ToolVisualProps> | null>(null)

  useEffect(() => {
    let alive = true
    resolve(path)()
      .then((module) => {
        if (alive) setComponent(() => module.default)
      })
      .catch((error) => {
        console.warn(`[extensions/tools] no se pudo cargar el visual "${path}":`, error)
      })
    return () => {
      alive = false
    }
  }, [path, resolve])

  if (!Component) return null
  return <Component args={args} result={result} status={status} />
}
