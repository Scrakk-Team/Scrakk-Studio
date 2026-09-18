import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { dndStore } from './store'
import type { DndState } from './store'
import type { DragPayload, ZoneDescriptor } from './types'

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
