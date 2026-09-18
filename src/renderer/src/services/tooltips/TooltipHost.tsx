/**
 * Tooltip global — servicio + host.
 *
 * API pública para CUALQUIER parte del IDE (y para extensiones vía
 * ctx.api.tooltips): show({ text, clientX, clientY }) posiciona un tooltip
 * con estilo del tema. El editor Innerta lo usa para hover LSP; los botones
 * de la app pueden migrar de `title` nativo a este.
 */

import { useEffect, useState, type JSX } from 'react'
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

export function showGlobalTooltip(request: TooltipRequest): void {
  window.dispatchEvent(new CustomEvent(SHOW_EVENT, { detail: request }))
}

export function hideGlobalTooltip(): void {
  window.dispatchEvent(new CustomEvent(HIDE_EVENT))
}

/** Componente host — se monta UNA vez en AppShell. */
export function TooltipHost(): JSX.Element | null {
  const [tooltip, setTooltip] = useState<TooltipRequest | null>(null)

  useEffect(() => {
    const onShow = (event: Event): void => {
      setTooltip((event as CustomEvent<TooltipRequest>).detail)
    }
    const onHide = (): void => setTooltip(null)
    window.addEventListener(SHOW_EVENT, onShow)
    window.addEventListener(HIDE_EVENT, onHide)
    window.addEventListener('scroll', onHide, true)
    return () => {
      window.removeEventListener(SHOW_EVENT, onShow)
      window.removeEventListener(HIDE_EVENT, onHide)
      window.removeEventListener('scroll', onHide, true)
    }
  }, [])

  if (!tooltip) return null

  // Posición: encima del punto, clamp a viewport. Los tooltips markdown
  // (hover LSP) son más anchos: el codeblock necesita espacio real.
  const width = tooltip.markdown ? 560 : 320
  const left = Math.min(Math.max(8, tooltip.clientX), window.innerWidth - width - 8)
  const top = Math.max(8, tooltip.clientY - 12)

  return (
    <div
      className={[styles.tooltip, tooltip.markdown ? styles.tooltipMarkdown : null]
        .filter(Boolean)
        .join(' ')}
      role="tooltip"
      style={{ left, top, maxWidth: width }}
    >
      {tooltip.markdown ? <Markdown content={tooltip.text} /> : tooltip.text}
    </div>
  )
}
