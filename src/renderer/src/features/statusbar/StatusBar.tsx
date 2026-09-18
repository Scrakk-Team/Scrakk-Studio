import { ProductIcon } from '@services/productIcons/components'
import { useEffect, useRef, useState, type JSX } from 'react'
import { SearchBar } from './components/SearchBar'
import { LspChip } from './components/LspChip/LspChip'
import { ProblemsChip } from './components/ProblemsChip/ProblemsChip'
import { GitChip } from './components/GitChip/GitChip'
import { CursorPosition } from './components/CursorPosition/CursorPosition'
import { ExtensionItems } from './components/ExtensionItems/ExtensionItems'
import { EncodingChip } from './components/EncodingChip/EncodingChip'
import { LayoutToggles } from './components/LayoutToggles/LayoutToggles'
import { NotificationsHistoryPanel } from '@features/notifications/NotificationsHistoryPanel'
import {
  showAnchoredModal,
  anchoredModalId,
  subscribeToModals,
  type AnchoredRect
} from '@services/modals'
import styles from './StatusBar.module.css'

interface StatusBarProps {
  onOpenSettings: () => void
}

/** Key del popover de historial en el registry de modales (para toggle). */
const NOTIFICATIONS_POPOVER_KEY = 'notifications-history'

/**
 * Barra de estado inferior (la típica de un IDE). Vive debajo del workspace,
 * pegada al borde de la ventana. Izquierda: LSP chip + posición de cursor.
 * Centro: SearchBar (paleta de comandos), flotante absoluto. Derecha:
 * campana de notificaciones + ajustes (mismo bloque chip que el LSP).
 * El tema se cambia desde la paleta (mod+alt+t) o Ajustes.
 */
export function StatusBar({ onOpenSettings }: StatusBarProps): JSX.Element {
  const bellRef = useRef<HTMLButtonElement | null>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)

  useEffect(
    () =>
      subscribeToModals(() => {
        setPopoverOpen(anchoredModalId(NOTIFICATIONS_POPOVER_KEY) !== null)
      }),
    []
  )

  const toggleNotifications = (): void => {
    const button = bellRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const anchor: AnchoredRect = {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    }
    showAnchoredModal({
      key: NOTIFICATIONS_POPOVER_KEY,
      title: 'Notificaciones',
      anchor,
      width: 300,
      render: () => <NotificationsHistoryPanel />
    })
  }

  return (
    <footer className={styles.bar} aria-label="Barra de estado">
      <div className={styles.group}>
        <LspChip />
        {/* Errores/advertencias: click = panel de Problemas (como VS Code). */}
        <ProblemsChip />
        <GitChip />
        <span className={styles.separator} aria-hidden="true" />
        <CursorPosition />
        <EncodingChip />
        {/* Items que las extensiones crean con `window.createStatusBarItem`. */}
        <ExtensionItems alignment="left" />
      </div>

      {/* SearchBar flotante: centrado absoluto respecto al .bar.
          Se saca del flow flex para que el centrado no dependa del
          ancho de los chips de la izquierda. */}
      <SearchBar />

      <div className={[styles.group, styles.groupRight].join(' ')}>
        <ExtensionItems alignment="right" />
        <LayoutToggles />
        <span className={styles.separator} aria-hidden="true" />
        <button
          ref={bellRef}
          type="button"
          className={styles.chipBtn}
          aria-label="Historial de notificaciones"
          aria-expanded={popoverOpen}
          title="Notificaciones"
          onClick={toggleNotifications}
        >
          <ProductIcon id="bell" size={14} />
        </button>
        <button
          type="button"
          className={styles.chipBtn}
          aria-label="Ajustes"
          title="Ajustes"
          onClick={onOpenSettings}
        >
          <ProductIcon id="settings-gear" size={14} />
        </button>
      </div>
    </footer>
  )
}