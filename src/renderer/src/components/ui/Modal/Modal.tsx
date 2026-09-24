// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useRef, type JSX, type ReactNode } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { IconButton } from '../IconButton/IconButton'
import styles from './Modal.module.css'

/** Tamaños del panel: md (default) y xl para settings/paneles grandes. */
export type ModalSize = 'sm' | 'md' | 'xl'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: ModalSize
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

/**
 * Primitive UI — modal plano (sin sombras ni glow): overlay oscuro,
 * panel centrado con título, botón de cierre, Esc y click afuera cierran.
 * Al abrir, el foco entra al panel y queda atrapado (Tab cicla adentro);
 * al cerrar, el foco vuelve al elemento que lo abrió.
 */
export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      const insidePanel = panelRef.current?.contains(active) ?? false
      if (event.shiftKey && (active === first || !insidePanel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !insidePanel)) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      // Solo al cerrar de verdad (deps [open]): el foco vuelve al trigger.
      previousFocus?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className={styles.overlay}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={[styles.panel, size === 'xl' ? styles.panelXl : null]
          .filter(Boolean)
          .join(' ')}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <IconButton label="Cerrar" size="sm" onClick={onClose}>
            <ProductIcon id="close" size={14} />
          </IconButton>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
