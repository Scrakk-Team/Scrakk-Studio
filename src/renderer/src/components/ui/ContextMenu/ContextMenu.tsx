/**
 * Menú contextual genérico — portal al body con posición clampada a la
 * ventana. Plano y capsular, con tokens de la app (sin sombras ni glow).
 */

import { useEffect, useLayoutEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './ContextMenu.module.css'

export interface ContextMenuItem {
  label: string
  /** Segunda línea, más chica y muted (ej. el proveedor del modelo). */
  sublabel?: string
  /** Acción del item. Opcional para items informativos/deshabilitados. */
  onClick?: () => void
  /** Ícono opcional a la izquierda del label. */
  icon?: ReactNode
  /** Marca el item como activo (check a la izquierda). */
  checked?: boolean
  danger?: boolean
  disabled?: boolean
  separatorBefore?: boolean
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  x: number
  y: number
  onClose: () => void
  /**
   * 'below' (default): el menú baja desde (x, y).
   * 'above': el menú sube y su borde INFERIOR queda en y (para pickers del
   * composer, que vive pegado al fondo).
   */
  placement?: 'below' | 'above'
}

const MENU_MARGIN = 8
const MENU_MAX_HEIGHT = 380

export function ContextMenu({ items, x, y, onClose, placement = 'below' }: ContextMenuProps): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  // Posiciona después del primer paint (mide el menú y lo clamp a la ventana).
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const left = Math.min(Math.max(MENU_MARGIN, x), window.innerWidth - rect.width - MENU_MARGIN)
    const top =
      placement === 'above'
        ? Math.max(MENU_MARGIN, y - rect.height)
        : Math.min(Math.max(MENU_MARGIN, y), window.innerHeight - rect.height - MENU_MARGIN)
    setPosition({ left, top })
  }, [x, y, placement])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  if (items.length === 0) return null

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: position.left, top: position.top, maxHeight: MENU_MAX_HEIGHT }}
      role="menu"
    >
      {items.map((item, index) => (
        <div key={index}>
          {item.separatorBefore ? <div className={styles.separator} /> : null}
          <button
            type="button"
            role="menuitem"
            className={[styles.item, item.danger ? styles.danger : null, item.disabled ? styles.disabled : null]
              .filter(Boolean)
              .join(' ')}
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onClick?.()
            }}
          >
            {item.checked ? <span className={styles.check}>✓</span> : null}
            {item.icon ? <span className={styles.icon}>{item.icon}</span> : null}
            {item.sublabel ? (
              <span className={styles.itemText}>
                <span className={styles.label}>{item.label}</span>
                <span className={styles.sublabel}>{item.sublabel}</span>
              </span>
            ) : (
              <span className={styles.label}>{item.label}</span>
            )}
          </button>
        </div>
      ))}
    </div>,
    document.body
  )
}