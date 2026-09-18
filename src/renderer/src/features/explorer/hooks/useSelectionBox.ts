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

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { ROW_HEIGHT } from '../constants'

/**
 * Índices de filas que intersectan el rectángulo (matemática pura por
 * altura fija, sin DOM). Exportada para tests.
 */
export function lassoRowRange(
  rowCount: number,
  y: number,
  h: number
): { firstRow: number; lastRow: number } {
  return {
    firstRow: Math.max(0, Math.floor(y / ROW_HEIGHT) - 2),
    lastRow: Math.min(rowCount - 1, Math.ceil((y + h) / ROW_HEIGHT) + 2)
  }
}

/**
 * Paths intersectados por el rectángulo (matemática pura). Exportada para tests.
 */
export function lassoPaths(flatPaths: string[], rowCount: number, y: number, h: number): string[] {
  const { firstRow, lastRow } = lassoRowRange(rowCount, y, h)
  const sel: string[] = []
  for (let i = firstRow; i <= lastRow; i++) {
    if (i < flatPaths.length) {
      const path = flatPaths[i]
      const top = i * ROW_HEIGHT
      if (top + ROW_HEIGHT >= y && top <= y + h) {
        sel.push(path)
      }
    }
  }
  return sel
}

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

  // Refs "latest": los listeners de window se enganchan UNA vez (estables),
  // pero siempre leen los datos frescos del render actual. Sin esto, el
  // drag usaría flatPaths/rowCount/onCommit del primer render (rancios tras
  // cargar/expandir el árbol) y el commit seleccionaría mal o nada.
  const flatPathsRef = useRef(flatPaths)
  flatPathsRef.current = flatPaths
  const rowCountRef = useRef(rowCount)
  rowCountRef.current = rowCount
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const onClearRef = useRef(onClear)
  onClearRef.current = onClear

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
      const paths = lassoPaths(flatPathsRef.current, rowCountRef.current, y, h)
      const sel = new Set(paths)

      pendingPaths.current = paths

      // Merge visual DURANTE el drag (contiguas por índice): igual que el
      // post-commit, pero por classList directa (cero React state).
      const order = new Map<string, number>()
      flatPathsRef.current.forEach((path, index) => {
        if (!order.has(path)) order.set(path, index)
      })

      // Actualizar clases directamente en el DOM (sin React state).
      const visibleRows = el.querySelectorAll('[data-row-path]')
      for (const row of visibleRows) {
        const path = (row as HTMLElement).dataset.rowPath
        if (path && sel.has(path)) {
          const index = order.get(path) ?? -1
          const list = flatPathsRef.current
          row.classList.add('row-selected-lasso')
          row.classList.toggle(
            'row-lasso-merge-top',
            index > 0 && sel.has(list[index - 1])
          )
          row.classList.toggle(
            'row-lasso-merge-bottom',
            index >= 0 && sel.has(list[index + 1])
          )
        } else {
          row.classList.remove('row-selected-lasso')
          row.classList.remove('row-lasso-merge-top')
          row.classList.remove('row-lasso-merge-bottom')
        }
      }
    },
    [containerRef]
  )

  const handleMouseDown = useCallback(
    (event: React.MouseEvent): void => {
      // Lasso en CUALQUIER fondo del árbol (laterales, huecos, bajo las
      // filas): solo se excluyen las filas (click/drag nativo propio) y los
      // controles interactivos (botones, inputs).
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (
        target.closest('[data-row-path], button, input, textarea, select, a, [data-drag-ignore]')
      ) {
        return
      }
      if (event.button !== 0) return

      event.preventDefault()
      const pos = getRelativePos(event.clientX, event.clientY)
      dragStart.current = pos
      isDragging.current = true

      // Limpiar selección previa.
      onClearRef.current()

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
    [getRelativePos, boxRef]
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
        row.classList.remove('row-lasso-merge-top')
        row.classList.remove('row-lasso-merge-bottom')
      })
    }

    // Commitear selección final al state de React.
    if (pendingPaths.current.length > 0) {
      onCommitRef.current(pendingPaths.current)
      pendingPaths.current = []
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [boxRef, containerRef])

  // Listeners globales estables (con cleanup: StrictMode-safe). Leen los
  // refs latest, así el drag siempre usa el árbol actual.
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  return { handleMouseDown }
}
