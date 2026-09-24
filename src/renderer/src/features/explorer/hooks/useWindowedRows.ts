// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Virtualización del árbol — optimizada para máximo rendimiento:
 *
 * 1. Threshold-based scroll: solo se actualiza el state cuando el scroll
 *    cruza el borde de una fila (reduce re-renders de 60/s a ~1 por fila).
 * 2. RAF throttle: un update por frame máximo.
 * 3. Scroll listener pasivo: no bloquea el main thread.
 * 4. ResizeObserver: solo actualiza en resize, no en scroll.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export interface WindowedRows {
  /** Índice (inclusivo) de la primera fila visible. */
  start: number
  /** Índice (exclusivo) de la última fila visible. */
  end: number
  /** Altura total del contenido (todas las filas). */
  totalHeight: number
  /** Ref del contenedor scrolleable. */
  containerRef: RefObject<HTMLDivElement | null>
  /**
   * Callback-ref para el contenedor: además de llenar containerRef,
   * dispara los efectos cuando el árbol se monta DESPUÉS del hook
   * (p. ej. estado vacío sin workspace → abrir carpeta).
   */
  attachContainer: (el: HTMLDivElement | null) => void
}

export function useWindowedRows(
  count: number,
  rowHeight: number,
  buffer = 10
): WindowedRows {
  const containerRef = useRef<HTMLDivElement | null>(null)
  /** Presencia del contenedor: re-ejecuta los efectos al montar el árbol. */
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const attachContainer = useCallback((el: HTMLDivElement | null): void => {
    containerRef.current = el
    setContainer(el)
  }, [])
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(0)
  const rafRef = useRef<number | null>(null)
  const scrollTopRef = useRef(0)

  // Alto del viewport vía ResizeObserver (nunca en scroll).
  useEffect(() => {
    if (!container) return
    const update = (): void => setViewport(container.clientHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [container])

  // Scroll listener pasivo + threshold-based — solo setState
  // cuando el scroll cruzó el borde de una fila. Reduce re-renders de 60/s
  // a ~1 por rowHeight px de scroll.
  useEffect(() => {
    if (!container) return

    const handleScroll = (): void => {
      scrollTopRef.current = container.scrollTop
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        // Solo actualizar si cruzó el threshold de una fila.
        if (Math.abs(scrollTopRef.current - scrollTop) >= rowHeight) {
          setScrollTop(scrollTopRef.current)
        }
      })
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [container, rowHeight, scrollTop])



  // Si el contenido cambió (expandir/colapsar/refresh) el navegador puede
  // recortar scrollTop; resincronizar para no renderizar una ventana vieja.
  useEffect(() => {
    const el = containerRef.current
    if (el && el.scrollTop !== scrollTop) {
      setScrollTop(el.scrollTop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, count])

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer)
  const end = Math.min(count, Math.ceil((scrollTop + viewport) / rowHeight) + buffer)

  return {
    start,
    end,
    totalHeight: count * rowHeight,
    containerRef,
    attachContainer
  }
}
