/**
 * Modal de Ajustes — contenedor con secciones laterales. Estilo BorealChat
 * (plano, capsular). Tamaño xl: gestión de temas y extensiones necesita
 * espacio de sobra.
 */

import { useCallback, useEffect, useState, type JSX } from 'react'
import { Modal } from '@ui/Modal'
import { AppearanceSection } from './sections/AppearanceSection'
import { ExtensionsSection } from './sections/ExtensionsSection'
import styles from './SettingsModal.module.css'

export type SettingsSectionId = 'appearance' | 'extensions' | 'info'

const SECTIONS: Array<{ id: SettingsSectionId; label: string }> = [
  { id: 'appearance', label: 'Apariencia' },
  { id: 'extensions', label: 'Extensiones' },
  { id: 'info', label: 'Acerca de' }
]

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: SettingsModalProps): JSX.Element | null {
  const [active, setActive] = useState<SettingsSectionId>('appearance')

  // Resetear a Apariencia al abrir.
  useEffect(() => {
    if (open) setActive('appearance')
  }, [open])

  const renderSection = useCallback(() => {
    if (active === 'appearance') return <AppearanceSection />
    if (active === 'extensions') return <ExtensionsSection />
    return (
      <div className={styles.info}>
        <p><strong>Scrakk Studio</strong> — Editor de código.</p>
        <p>React + TypeScript + Electron. Sistema de paneles resizables y extensiones.</p>
        <p className={styles.version}>v0.1.0</p>
      </div>
    )
  }, [active])

  return (
    <Modal open={open} onClose={onClose} title="Ajustes" size="xl">
      <div className={styles.body}>
        <nav className={styles.nav} aria-label="Secciones de ajustes">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={[styles.navItem, active === section.id ? styles.navItemActive : null]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setActive(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>
        <div className={styles.content}>{renderSection()}</div>
      </div>
    </Modal>
  )
}
