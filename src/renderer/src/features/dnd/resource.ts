// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Recurso externo arrastrado al layout (archivo o carpeta del explorador).
 *
 * El explorador usa drag & drop NATIVO (HTML5) para mover archivos; el layout
 * de tabs usa un drag por pointer. Para que convivan, el explorador publica su
 * recurso con un MIME propio y las zonas de tabs lo aceptan con handlers
 * nativos: el drag por pointer de las tabs no se toca.
 */

export const RESOURCE_MIME = 'application/x-scrakk-resource'

export interface ResourceDragItem {
  kind: 'file' | 'folder'
  path: string
  name: string
}

interface ResourceDragPayload {
  items: ResourceDragItem[]
}

/** Publica el recurso en el `dataTransfer` (más `text/plain` como fallback). */
export function setResourceDragData(dataTransfer: DataTransfer, items: ResourceDragItem[]): void {
  if (items.length === 0) return
  dataTransfer.setData(RESOURCE_MIME, JSON.stringify({ items }))
  dataTransfer.setData('text/plain', items[0].path)
}

/** true si el drag trae un recurso del explorador. */
export function hasResourceDragData(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(RESOURCE_MIME)
}

/** Lee el recurso del `dataTransfer` (null si no es nuestro o está corrupto). */
export function readResourceDragData(dataTransfer: DataTransfer): ResourceDragItem[] | null {
  const raw = dataTransfer.getData(RESOURCE_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ResourceDragPayload
    if (!parsed || !Array.isArray(parsed.items)) return null
    const items = parsed.items.filter(
      (item): item is ResourceDragItem =>
        !!item &&
        (item.kind === 'file' || item.kind === 'folder') &&
        typeof item.path === 'string' &&
        typeof item.name === 'string'
    )
    return items.length > 0 ? items : null
  } catch {
    return null
  }
}
