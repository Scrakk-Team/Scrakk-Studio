import { useLayoutEffect, type RefObject } from 'react'

/**
 * Encaja el svg del botón al device pixel más cercano.
 *
 * El glifo (trazos finos) se rasteriza asimétrico si cae en una posición
 * fraccionaria de device pixel — se ve borroso según dónde caiga en el
 * layout. Misma técnica que el cerrar de tabs (TabStrip): trasladar el svg
 * por el resto fraccionario. Solo escribe si hay resto (sin thrash).
 */
export function useSnapSvg(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const snap = (): void => {
      const svg = ref.current?.querySelector('svg')
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      const dpr = window.devicePixelRatio || 1
      const x = Math.round(rect.left * dpr) / dpr - rect.left
      const y = Math.round(rect.top * dpr) / dpr - rect.top
      const next = x === 0 && y === 0 ? '' : `translate(${x}px, ${y}px)`
      if (svg.style.transform !== next) svg.style.transform = next
    }
    snap()
    window.addEventListener('scroll', snap, true)
    window.addEventListener('resize', snap)
    return () => {
      window.removeEventListener('scroll', snap, true)
      window.removeEventListener('resize', snap)
    }
  }, [ref])
}
