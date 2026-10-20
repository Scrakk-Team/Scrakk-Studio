// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

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
  /** Atajo a la derecha (ej. `Ctrl+O`). */
  shortcut?: string
  /**
   * Submenú: si tiene items, el item abre un submenú (al hover o al click)
   * en vez de ejecutar `onClick`. Un solo nivel (los menús de la app).
   */
  submenu?: ContextMenuItem[]
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

function MenuCheck(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m3.75 8.25 2.75 2.75 5.75-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MenuChevron(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.25 4.25 9.75 8l-3.5 3.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ContextMenu({ items, x, y, onClose, placement = 'below' }: ContextMenuProps): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })
  // Índice del item cuyo submenú está abierto (uno a la vez).
  const [openSub, setOpenSub] = useState<number | null>(null)

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

  // Si hay submenús, el menú NO recorta (si no, el submenú de la derecha queda
  // clipeado por el overflow del panel scrolleable).
  const hasSubmenus = items.some((it) => !!it.submenu && it.submenu.length > 0)

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      style={{
        left: position.left,
        top: position.top,
        maxHeight: hasSubmenus ? undefined : MENU_MAX_HEIGHT,
        overflow: hasSubmenus ? 'visible' : undefined
      }}
      role="menu"
    >
      {items.map((item, index) => {
        const hasSub = !!item.submenu && item.submenu.length > 0
        return (
          <div
            key={index}
            className={styles.row}
            onMouseEnter={() => setOpenSub(hasSub ? index : null)}
          >
            {item.separatorBefore ? <div className={styles.separator} /> : null}
            <button
              type="button"
              role="menuitem"
              aria-haspopup={hasSub || undefined}
              className={[styles.item, item.danger ? styles.danger : null, item.disabled ? styles.disabled : null]
                .filter(Boolean)
                .join(' ')}
              disabled={item.disabled}
              onClick={() => {
                if (hasSub) {
                  setOpenSub(index)
                  return
                }
                onClose()
                item.onClick?.()
              }}
            >
              <span className={styles.lead} aria-hidden="true">
                {item.checked ? <MenuCheck /> : item.icon ? item.icon : null}
              </span>
              {item.sublabel ? (
                <span className={styles.itemText}>
                  <span className={styles.label}>{item.label}</span>
                  <span className={styles.sublabel}>{item.sublabel}</span>
                </span>
              ) : (
                <span className={styles.label}>{item.label}</span>
              )}
              {hasSub ? <span className={styles.caret}><MenuChevron /></span> : null}
              {!hasSub && item.shortcut ? <span className={styles.shortcut}>{item.shortcut}</span> : null}
            </button>
            {hasSub && openSub === index ? (
              <div className={styles.submenu} role="menu">
                {item.submenu!.map((sub, si) => (
                  <div key={si}>
                    {sub.separatorBefore ? <div className={styles.separator} /> : null}
                    <button
                      type="button"
                      role="menuitem"
                      className={[styles.item, sub.danger ? styles.danger : null, sub.disabled ? styles.disabled : null]
                        .filter(Boolean)
                        .join(' ')}
                      disabled={sub.disabled}
                      onClick={() => {
                        onClose()
                        sub.onClick?.()
                      }}
                    >
                      <span className={styles.lead} aria-hidden="true">
                        {sub.checked ? <MenuCheck /> : sub.icon ? sub.icon : null}
                      </span>
                      <span className={styles.label}>{sub.label}</span>
                      {sub.shortcut ? <span className={styles.shortcut}>{sub.shortcut}</span> : null}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>,
    document.body
  )
}