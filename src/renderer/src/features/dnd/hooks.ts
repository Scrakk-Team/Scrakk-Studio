import { useEffect, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { dndStore } from './store'
import type { DndState } from './store'
import type { DragPayload, ZoneDescriptor } from './types'
import { hasResourceDragData, readResourceDragData, type ResourceDragItem } from './resource'

/** Estado vivo de la sesión de drag (re-render por movimiento). */
export function useDndState(): DndState {
  const [state, setState] = useState<DndState>(() => dndStore.getState())
  useEffect(() => dndStore.subscribe(() => setState(dndStore.getState())), [])
  return state
}

/**
 * Convierte una manija en fuente de drag. Devuelve el handler pointerdown:
 * registra el payload como candidato; el drag real arranca al superar el
 * umbral de 4px (un click simple sigue funcionando como click).
 */
export function useDraggable(
  payload: DragPayload,
  elementRef?: React.RefObject<HTMLElement | null>
): {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
} {
  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.button !== 0) return
      const el = elementRef?.current ?? (event.currentTarget as HTMLElement)
      dndStore.beginPending(payload, el, event.clientX, event.clientY)
      // Evita que el navegador arranque selección/texto nativo durante el drag.
      event.preventDefault()
    }
  }
}

/**
 * Registra un elemento como ZONA de drop (para el cálculo del target bajo el
 * cursor). Devuelve una ref para colgar del elemento.
 */
export function useDropZone(desc: Omit<ZoneDescriptor, 'el'>): {
  ref: (el: HTMLElement | null) => void
} {
  const [node, setNode] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!node) return
    return dndStore.registerZone(node, desc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, desc.kind, desc.stripId, desc.tabIndex, desc.horizontal, desc.append, desc.isSplit])
  return { ref: setNode }
}

/**
 * Acepta el drop NATIVO de un recurso del explorador (archivo/carpeta) sin
 * tocar el drag por pointer de las tabs. Devuelve handlers para colgar de la
 * zona y `active` para el highlight.
 */
export function useResourceDrop(onDropResource: (items: ResourceDragItem[]) => void): {
  active: boolean
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
} {
  const [active, setActive] = useState(false)

  const onDragOver = (event: DragEvent<HTMLElement>): void => {
    if (!hasResourceDragData(event.dataTransfer)) return
    // Frena el drop nativo del navegador y avisa "copiar".
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setActive(true)
    // Mismo indicador (la rayita) que el drag de tabs.
    dndStore.updateResourceTarget(event.clientX, event.clientY)
  }

  const onDragLeave = (event: DragEvent<HTMLElement>): void => {
    if (!hasResourceDragData(event.dataTransfer)) return
    // `dragleave` también dispara al pasar por hijos: solo apagar si el puntero
    // salió de la zona de verdad.
    const next = event.relatedTarget as Node | null
    if (next && event.currentTarget.contains(next)) return
    setActive(false)
    dndStore.clearResourceTarget()
  }

  const onDrop = (event: DragEvent<HTMLElement>): void => {
    if (!hasResourceDragData(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    setActive(false)
    dndStore.clearResourceTarget()
    const items = readResourceDragData(event.dataTransfer)
    if (items) onDropResource(items)
  }

  return { active, onDragOver, onDragLeave, onDrop }
}
