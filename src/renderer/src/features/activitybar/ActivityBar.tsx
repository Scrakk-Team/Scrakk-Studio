/**
 * Activity Bar — barra vertical de botones para activar/desactivar paneles.
 * Estados replicados del ActivityBar de Scrakk Code Editor:
 *  - Inactivo: ícono en tono muted, sin fondo.
 *  - Hover: color de texto + fondo sutil.
 *  - Activo: color acento + tinte del acento de fondo + indicador lateral
 *    de 3px que escala verticalmente.
 *
 * Mergea los botones registrados (registry estático) con los que aportan
 * las extensiones en runtime (ExtensionRegistry) — se re-renderiza al
 * instalarse o quitarse extensiones.
 */

import { useEffect, useMemo, useState, type JSX } from 'react'
import { useLayout } from '@features/layout'
import { ExtensionRegistry } from '@services/extensions'
import type { ActivityBarButton, ActivityBarSide } from './types'
import { getButtonsForSide } from './registry'
import styles from './ActivityBar.module.css'

export function ActivityBar({ side }: { side: ActivityBarSide }): JSX.Element {
  const { slots, toggleSlotPanel } = useLayout()
  const [version, setVersion] = useState(0)

  // Re-render cuando se instalan/remueven extensiones (botones de runtime).
  useEffect(() => {
    return ExtensionRegistry.subscribe(() => setVersion((v) => v + 1))
  }, [])

  const buttons = useMemo<ActivityBarButton[]>(() => getButtonsForSide(side), [side, version])

  return (
    <nav
      className={styles.bar}
      data-side={side}
      aria-label={side === 'left' ? 'Barra lateral izquierda' : 'Barra lateral derecha'}
    >
      {buttons.map((button) => {
        const active = slots[button.target] === button.panelId
        return (
          <button
            key={button.id}
            type="button"
            className={[styles.button, active ? styles.active : null].filter(Boolean).join(' ')}
            title={button.label}
            aria-label={button.label}
            aria-pressed={active}
            onClick={() => toggleSlotPanel(button.target, button.panelId)}
          >
            {typeof button.icon === 'string' ? (
              <span className={styles.svg} dangerouslySetInnerHTML={{ __html: button.icon }} />
            ) : (
              <button.icon size={20} />
            )}
          </button>
        )
      })}
    </nav>
  )
}
