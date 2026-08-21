/**
 * useSelectionBox — caja de selección tipo "lasso" / rubber-band.
 *
 * OPTIMIZACIÓN CLAVE: manipulación directa del DOM (sin React state)
 * durante el drag, igual que Scrakk Code Editor. Solo se commitea
 * la selección al final en mouseUp.
 *
 * Patrón:
 *  - El div del selection box ya existe en el DOM (display: none).
 *  - En mousedown se muestra y posiciona via box.style.*
 *  - En mousemove se actualiza via box.style.* + classList en filas.
 *  - En mouseUp se commitea la selección final al state de React.
 */

import { useCallback, useRef, type RefObject } from 'react'
import { ROW_HEIGHT } from '../constants'

interface UseSelectionBoxOptions {
  /** Ref del contenedor scrolleable del árbol. */
  containerRef: RefObject<HTMLDivElement | null>
  /** Ref del div del selection box (pre-rendered, display: none). */
  boxRef: RefObject<HTMLDivElement | null>
  /** Cantidad total de filas. */
  rowCount: number
  /** Paths de las filas en orden. */
  flatPaths: string[]
  /** Callback al finalizar la selección (mouseUp). */
  onCommit: (paths: string[]) => void
  /** Callback al iniciar (para limpiar selección previa). */
  onClear: () => void
}

export function useSelectionBox({
  containerRef,
  boxRef,
  rowCount,
  flatPaths,
  onCommit,
  onClear
}: UseSelectionBoxOptions) {
  const isDragging = useRef(false)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastMousePos = useRef<{ x: number; y: number } | null>(null)
  const pendingPaths = useRef<string[]>([])

  const getRelativePos = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const el = containerRef.current
      if (!el) return { x: 0, y: 0 }
      const rect = el.getBoundingClientRect()
      return {
        x: clientX - rect.left,
        y: clientY - rect.top + el.scrollTop
      }
    },
    [containerRef]
  )

  /** Calcula paths intersectados y actualiza el DOM directamente. */
  const updateSelection = useCallback(
    (boxState: { x: number; y: number; w: number; h: number }): void => {
      const el = containerRef.current
      if (!el) return

      const { y, h } = boxState

      // Calcular paths que intersectan.
      const sel = new Set<string>()
      const firstRow = Math.max(0, Math.floor(y / ROW_HEIGHT) - 2)
      const lastRow = Math.min(rowCount - 1, Math.ceil((y + h) / ROW_HEIGHT) + 2)

      for (let i = firstRow; i <= lastRow; i++) {
        if (i < flatPaths.length) {
          const path = flatPaths[i]
          const top = i * ROW_HEIGHT
          if (top + ROW_HEIGHT >= y && top <= y + h) {
            sel.add(path)
          }
        }
      }

      pendingPaths.current = [...sel]

      // Actualizar clases directamente en el DOM (sin React state).
      const visibleRows = el.querySelectorAll('[data-row-path]')
      for (const row of visibleRows) {
        const path = (row as HTMLElement).dataset.rowPath
        if (path && sel.has(path)) {
          row.classList.add('row-selected-lasso')
        } else {
          row.classList.remove('row-selected-lasso')
        }
      }
    },
    [containerRef, rowCount, flatPaths]
  )

  const handleMouseDown = useCallback(
    (event: React.MouseEvent): void => {
      // Solo activar en mousedown directo del contenedor (fondo del árbol).
      if (event.target !== event.currentTarget) return
      if (event.button !== 0) return

      event.preventDefault()
      const pos = getRelativePos(event.clientX, event.clientY)
      dragStart.current = pos
      isDragging.current = true

      // Limpiar selección previa.
      onClear()

      // Mostrar y resetear el box via DOM directo.
      const box = boxRef.current
      if (box) {
        box.style.display = 'block'
        box.style.left = `${pos.x}px`
        box.style.top = `${pos.y}px`
        box.style.width = '0px'
        box.style.height = '0px'
      }
    },
    [getRelativePos, boxRef, onClear]
  )

  const handleMouseMove = useCallback(
    (event: MouseEvent): void => {
      if (!isDragging.current || !dragStart.current) return

      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const pos = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top + el.scrollTop
      }
      lastMousePos.current = pos

      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (!lastMousePos.current || !dragStart.current) return

        const { x: cx, y: cy } = lastMousePos.current
        const sx = dragStart.current.x
        const sy = dragStart.current.y

        const left = Math.min(sx, cx)
        const top = Math.min(sy, cy)
        const w = Math.abs(cx - sx)
        const h = Math.abs(cy - sy)

        // Actualizar box via DOM directo.
        const box = boxRef.current
        if (box) {
          box.style.left = `${left}px`
          box.style.top = `${top}px`
          box.style.width = `${w}px`
          box.style.height = `${h}px`
        }

        // Actualizar selección si el rectángulo es significativo.
        if (w > 3 || h > 3) {
          updateSelection({ x: left, y: top, w, h })
        }
      })
    },
    [containerRef, boxRef, updateSelection]
  )

  const handleMouseUp = useCallback((): void => {
    if (!isDragging.current) return

    isDragging.current = false
    dragStart.current = null
    lastMousePos.current = null

    // Ocultar box via DOM directo.
    const box = boxRef.current
    if (box) {
      box.style.display = 'none'
    }

    // Limpiar clases de lasso de las filas.
    const el = containerRef.current
    if (el) {
      el.querySelectorAll('.row-selected-lasso').forEach((row) => {
        row.classList.remove('row-selected-lasso')
      })
    }

    // Commitear selección final al state de React.
    if (pendingPaths.current.length > 0) {
      onCommit(pendingPaths.current)
      pendingPaths.current = []
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [boxRef, containerRef, onCommit])

  // Listeners globales (solo se registran una vez).
  const attachedRef = useRef(false)
  if (!attachedRef.current) {
    attachedRef.current = true
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  return { handleMouseDown }
}
