// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tooltip global — servicio + host.
 *
 * API pública para CUALQUIER parte del IDE (y para extensiones vía
 * ctx.api.tooltips): show({ text, clientX, clientY }) posiciona un tooltip
 * con estilo del tema. El editor Innerta lo usa para hover LSP; los botones
 * de la app pueden migrar de `title` nativo a este.
 *
 * REGLA DE ORO: si el puntero está ENCIMA del tooltip, el tooltip NO se
 * oculta. Un hover de LSP es contenido para LEER (a veces con tablas y código
 * que hay que copiar): si el puntero entra en el tooltip, éste se queda
 * quieto hasta que el puntero lo abandona.
 */

import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { Markdown } from '@features/chat/components/Markdown/Markdown'
import styles from './TooltipHost.module.css'

export interface TooltipRequest {
  text: string
  clientX: number
  clientY: number
  /**
   * true = `text` es markdown y se renderiza con el MISMO pipeline del chat
   * (GFM, tablas, code blocks con Prism, HTML crudo sanitizado). Lo usa el
   * hover LSP; los tooltips simples de la app siguen en texto plano.
   */
  markdown?: boolean
}

const SHOW_EVENT = 'app-tooltip'
const HIDE_EVENT = 'app-tooltip-hide'
/** Oculta sí o sí (scroll, click): ignora el "el puntero está encima". */
const HIDE_FORCE_EVENT = 'app-tooltip-hide-force'

export function showGlobalTooltip(request: TooltipRequest): void {
  window.dispatchEvent(new CustomEvent(SHOW_EVENT, { detail: request }))
}

/** Oculta el tooltip (salvo que el puntero esté encima: ver la regla de oro). */
export function hideGlobalTooltip(): void {
  window.dispatchEvent(new CustomEvent(HIDE_EVENT))
}

/** Oculta el tooltip aunque el puntero esté encima (scroll, click). */
export function hideGlobalTooltipForce(): void {
  window.dispatchEvent(new CustomEvent(HIDE_FORCE_EVENT))
}

/** Componente host — se monta UNA vez en AppShell. */
export function TooltipHost(): JSX.Element | null {
  const [tooltip, setTooltip] = useState<TooltipRequest | null>(null)
  /** El puntero está ENCIMA del tooltip → no se oculta. */
  const hoveredRef = useRef(false)
  /** Timer de "ocultar cuando el puntero se aleja". */
  const hideTimerRef = useRef<number | undefined>(undefined)
  /** El tooltip no entra arriba del puntero: va debajo. */
  const [below, setBelow] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  const clearHideTimer = (): void => {
    if (hideTimerRef.current !== undefined) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = undefined
    }
  }

  useEffect(() => {
    const onShow = (event: Event): void => {
      clearHideTimer()
      setTooltip((event as CustomEvent<TooltipRequest>).detail)
    }
    // Hide "normal": si el puntero está encima, NO se oculta (quedate a leer).
    const onHide = (): void => {
      if (hoveredRef.current) return
      clearHideTimer()
      setTooltip(null)
    }
    // Hide forzado: scroll o click → el tooltip se va igual.
    const onForceHide = (): void => {
      clearHideTimer()
      setTooltip(null)
    }
    window.addEventListener(SHOW_EVENT, onShow)
    window.addEventListener(HIDE_EVENT, onHide)
    window.addEventListener(HIDE_FORCE_EVENT, onForceHide)
    window.addEventListener('scroll', onForceHide, true)
    return () => {
      window.removeEventListener(SHOW_EVENT, onShow)
      window.removeEventListener(HIDE_EVENT, onHide)
      window.removeEventListener(HIDE_FORCE_EVENT, onForceHide)
      window.removeEventListener('scroll', onForceHide, true)
      clearHideTimer()
    }
  }, [])

  // ¿Entra arriba o debajo del puntero? Se decide con el alto REAL (el
  // markdown puede medir 320px): si arriba no entra, va abajo.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !tooltip) return
    const height = el.getBoundingClientRect().height
    setBelow(tooltip.clientY - 12 - height < 8)
  }, [tooltip])

  if (!tooltip) return null

  // Posición: al LADO del puntero (no debajo), con clamp al viewport. Los
  // tooltips markdown (hover LSP) son más anchos: el codeblock necesita
  // espacio real.
  const width = tooltip.markdown ? 560 : 320
  const gap = 12
  let left = tooltip.clientX + gap
  if (left + width > window.innerWidth - 8) left = tooltip.clientX - width - gap
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
  const top = below ? tooltip.clientY + gap : tooltip.clientY - gap

  return (
    <div
      ref={ref}
      className={[styles.tooltip, tooltip.markdown ? styles.tooltipMarkdown : null,
        below ? styles.tooltipBelow : null]
        .filter(Boolean)
        .join(' ')}
      role="tooltip"
      style={{ left, top, maxWidth: width }}
      // El puntero entra al tooltip → se queda quieto (y se cancela el
      // "ocultar cuando se aleja"). Al salir → se oculta.
      onPointerEnter={() => {
        hoveredRef.current = true
        clearHideTimer()
      }}
      onPointerLeave={() => {
        hoveredRef.current = false
        clearHideTimer()
        setTooltip(null)
      }}
    >
      {tooltip.markdown ? <Markdown content={tooltip.text} /> : tooltip.text}
    </div>
  )
}
