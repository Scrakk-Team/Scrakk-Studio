// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Modal de Ajustes — contenedor genérico con secciones laterales. Estilo
 * Scrakk Studio (plano, capsular). Tamaño xl: gestión de temas y extensiones
 * necesita espacio de sobra.
 *
 * No conoce ninguna sección: el nav y el render salen del registry
 * (sections/index.ts). Servidores es padre de Resaltado (hijo desplegable
 * con chevron a la izquierda). La zona LSP abre directo desde el chip del
 * statusbar vía initialSection.
 */

import { useEffect, useState, type JSX } from 'react'
import { Modal } from '@ui'
import { ProductIcon } from '@services/productIcons/components'
import { SETTINGS_SECTIONS, type SettingsSectionId } from './sections'
import styles from './SettingsModal.module.css'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  /** Sección activa al abrir (y si cambia con el modal abierto). */
  initialSection?: SettingsSectionId
}

export function SettingsModal({ open, onClose, initialSection }: SettingsModalProps): JSX.Element | null {
  const [active, setActive] = useState<SettingsSectionId>('appearance')
  const [expanded, setExpanded] = useState<SettingsSectionId[]>([])

  // Resetear a la sección pedida al abrir (default Apariencia).
  useEffect(() => {
    if (open) setActive(initialSection ?? 'appearance')
  }, [open, initialSection])

  // Si la sección activa es hija, su padre se despliega solo.
  useEffect(() => {
    const parent = SETTINGS_SECTIONS.find((section) => section.id === active)?.parent
    if (parent) {
      setExpanded((prev) => (prev.includes(parent) ? prev : [...prev, parent]))
    }
  }, [active])

  const toggleGroup = (id: SettingsSectionId): void => {
    setExpanded((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]))
  }

  const selectParent = (id: SettingsSectionId): void => {
    setActive(id)
    setExpanded((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  const topSections = SETTINGS_SECTIONS.filter((section) => !section.parent)
  const childrenOf = (id: SettingsSectionId): typeof SETTINGS_SECTIONS =>
    SETTINGS_SECTIONS.filter((section) => section.parent === id)

  const ActiveSection =
    (SETTINGS_SECTIONS.find((section) => section.id === active) ?? SETTINGS_SECTIONS[0]).component

  return (
    <Modal open={open} onClose={onClose} title="Ajustes" size="xl">
      <div className={styles.body}>
        <nav className={styles.nav} aria-label="Secciones de ajustes">
          {topSections.map((section) => {
            const children = childrenOf(section.id)
            if (children.length === 0) {
              return (
                <button
                  key={section.id}
                  type="button"
                  className={[styles.navItem, active === section.id ? styles.navItemActive : null]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setActive(section.id)}
                >
                  <ProductIcon id={section.icon} size={14} aria-hidden="true" />
                  {section.label}
                </button>
              )
            }
            const isOpen = expanded.includes(section.id)
            return (
              <div key={section.id} className={styles.navGroup}>
                <div
                  className={[styles.navParent, active === section.id ? styles.navItemActive : null]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <button
                    type="button"
                    className={styles.navChevron}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? `Contraer ${section.label}` : `Desplegar ${section.label}`}
                    onClick={() => toggleGroup(section.id)}
                  >
                    <span
                      className={isOpen ? styles.chevronOpen : styles.chevron}
                      aria-hidden="true"
                    >
                      <ProductIcon id="chevron-right" size={12} />
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.navParentLabel}
                    onClick={() => selectParent(section.id)}
                  >
                    <ProductIcon id={section.icon} size={14} aria-hidden="true" />
                    {section.label}
                  </button>
                </div>
                {isOpen
                  ? children.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        className={[
                          styles.navItem,
                          styles.navChild,
                          active === child.id ? styles.navItemActive : null
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => setActive(child.id)}
                      >
                        <ProductIcon id={child.icon} size={14} aria-hidden="true" />
                        {child.label}
                      </button>
                    ))
                  : null}
              </div>
            )
          })}
        </nav>
        <div className={styles.content}>
          <ActiveSection />
        </div>
      </div>
    </Modal>
  )
}
